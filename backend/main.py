import logging
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

from backend.config import settings
from backend.database import engine, Base, get_db
from backend.models import User, FaceEmbedding, LoginAttempt
from backend.schemas import (
    SignupRequest, LoginRequest, LoginResponse, Token,
    UserResponse, RefreshTokenRequest, BiometricChallengeCheck
)
from backend.services.embedding_service import embedding_service
from backend.services.camera_validation import camera_validation_service
from backend.services.quality_service import quality_service
from backend.services.challenge_service import challenge_service
from backend.services.matching_service import matching_service
from backend.services.jwt_service import jwt_service

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-auth-platform")

app = FastAPI(
    title="Biometric Face Authentication Platform API",
    version="1.0.0",
    docs_url="/docs"
)

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_db():
    logger.info("Initializing database and pgvector extension...")
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables and pgvector extension created successfully.")

@app.post("/api/v1/challenge/verify")
def verify_live_challenge(payload: BiometricChallengeCheck):
    """
    Real-time endpoint for checking individual frames for active challenges
    (smile, blink, head turns) to guide the frontend webcam state machine.
    """
    try:
        img = embedding_service.base64_to_cv2(payload.frame_data)
        faces = embedding_service.detect_faces(img)
        
        # 1. Check face presence
        ok, msg = camera_validation_service.validate_face_presence(faces)
        if not ok:
            return {"success": False, "score": 0.0, "message": msg}
            
        face = faces[0]
        h, w, _ = img.shape
        
        # 2. Check alignment & distance
        align_ok, align_msg = camera_validation_service.validate_alignment(face, w, h)
        if not align_ok:
            return {"success": False, "score": 0.0, "message": align_msg}
            
        # 3. Check quality (blur & brightness)
        brightness_ok, _, bright_msg = quality_service.evaluate_brightness(img)
        if not brightness_ok:
            return {"success": False, "score": 0.0, "message": bright_msg}
            
        blur_ok, _, blur_msg = quality_service.evaluate_blur(img)
        if not blur_ok:
            return {"success": False, "score": 0.0, "message": blur_msg}
            
        # 4. Check target active challenge
        res = challenge_service.verify_challenge(face, payload.challenge_type)
        return res
        
    except Exception as e:
        logger.error(f"Error in live challenge check: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Challenge processing failed: {str(e)}"
        )

@app.post("/api/v1/signup", response_model=UserResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """
    Signup endpoint:
    - Decodes and validates 3 to 5 pose frames (straight, left, right, up, down).
    - Generates embeddings and performs 1:N duplicate search.
    - Saves user and face profiles to database.
    """
    # 1. Input validations
    existing_user = db.query(User).filter((User.username == payload.username) | (User.email == payload.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )
        
    if not (3 <= len(payload.frames) <= 5):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide between 3 and 5 verification frames"
        )

    # Pose sequence mapping
    poses = ["straight", "left", "right", "up", "down"]
    embeddings_to_save = []
    quality_scores = []
    
    # 2. Process and validate all images
    for i, base64_frame in enumerate(payload.frames):
        target_pose = poses[i] if i < len(poses) else "straight"
        try:
            img = embedding_service.base64_to_cv2(base64_frame)
            faces = embedding_service.detect_faces(img)
            
            presence_ok, presence_msg = camera_validation_service.validate_face_presence(faces)
            if not presence_ok:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Frame {i+1} ({target_pose}): {presence_msg}")
                
            face = faces[0]
            h, w, _ = img.shape
            
            align_ok, align_msg = camera_validation_service.validate_alignment(face, w, h)
            if not align_ok:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Frame {i+1} ({target_pose}) alignment: {align_msg}")
                
            # Quality & Pose Validation
            check_res = quality_service.run_all_quality_checks(img, face, target_pose)
            if not check_res["success"]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Frame {i+1} ({target_pose}) quality: {check_res['reason']}")
                
            embedding = embedding_service.extract_embedding(face)
            if embedding is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Frame {i+1} ({target_pose}): Failed to extract vector representation")
                
            embeddings_to_save.append(embedding)
            quality_scores.append(check_res["scores"].get("confidence", 1.0))
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing signup frame {i+1}: {str(e)}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to process frame {i+1}")

    # 3. 1:N Duplicate search
    for idx, emb in enumerate(embeddings_to_save):
        is_duplicate, max_sim, dup_id = matching_service.check_duplicate_enrollment(db, emb)
        if is_duplicate:
            logger.warning(f"Signup rejected. User matches existing profile {dup_id} with similarity {max_sim:.3f}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Face already enrolled. Similarity: {max_sim:.3f}"
            )

    # 4. Save User & Embeddings
    password_hash = jwt_service.hash_password(payload.password) if payload.password else None
    
    new_user = User(
        username=payload.username,
        email=payload.email,
        password_hash=password_hash
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    for i, emb in enumerate(embeddings_to_save):
        face_emb = FaceEmbedding(
            user_id=new_user.id,
            embedding=emb,
            quality_score=quality_scores[i]
        )
        db.add(face_emb)
        
    db.commit()
    logger.info(f"User {new_user.username} registered successfully.")
    return new_user

@app.post("/api/v1/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Login endpoint:
    - Resolves username or email.
    - Validates image quality and face details.
    - Compares face embedding against stored user templates (1:1 Verification).
    - Logs login attempt and issues JWT tokens.
    """
    ip_addr = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    # 1. Resolve User and verify credentials
    user = db.query(User).filter((User.username == payload.username_or_email) | (User.email == payload.username_or_email)).first()
    
    is_password_valid = False
    if user and user.password_hash:
        is_password_valid = jwt_service.verify_password(payload.password, user.password_hash)

    if not user or not is_password_valid:
        # Save a failed login attempt with no user_id associated
        attempt = LoginAttempt(
            user_id=user.id if user else None,
            success=False,
            failure_reason="Invalid passphrase" if user else "User not found",
            similarity_score=0.0,
            ip_address=ip_addr,
            user_agent=ua
        )
        db.add(attempt)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    try:
        # 2. Decode & check login frame
        img = embedding_service.base64_to_cv2(payload.frame)
        faces = embedding_service.detect_faces(img)
        
        presence_ok, presence_msg = camera_validation_service.validate_face_presence(faces)
        if not presence_ok:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=presence_msg)
            
        face = faces[0]
        h, w, _ = img.shape
        
        align_ok, align_msg = camera_validation_service.validate_alignment(face, w, h)
        if not align_ok:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Alignment error: {align_msg}")
            
        check_res = quality_service.run_all_quality_checks(img, face, "straight")
        if not check_res["success"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Quality check: {check_res['reason']}")
            
        # Optional challenge validation verification logic
        challenge_res = challenge_service.verify_challenge(face, payload.challenge_completed)
        if not challenge_res["success"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Challenge verification failed: {challenge_res['message']}")
            
        # 3. Extract embedding & run 1:1 match
        embedding = embedding_service.extract_embedding(face)
        if embedding is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to parse vector profile")
            
        is_verified, similarity_score = matching_service.verify_user_face(db, user.id, embedding)
        
        # 4. Log attempt
        attempt = LoginAttempt(
            user_id=user.id,
            success=is_verified,
            failure_reason=None if is_verified else "Biometric mismatch",
            similarity_score=similarity_score,
            ip_address=ip_addr,
            user_agent=ua
        )
        db.add(attempt)
        db.commit()
        
        if not is_verified:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Biometric authentication failed. Similarity: {similarity_score:.3f}"
            )
            
        # 5. Issue JWT
        user_response = UserResponse.from_orm(user)
        access_token = jwt_service.create_access_token(data={"sub": user.username})
        refresh_token = jwt_service.create_refresh_token(data={"sub": user.username})
        
        token_payload = Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_response
        )
        
        return LoginResponse(
            success=True,
            message="Face verified successfully",
            similarity_score=similarity_score,
            token=token_payload
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing login: {str(e)}")
        # Log error attempt
        attempt = LoginAttempt(
            user_id=user.id,
            success=False,
            failure_reason=f"Processing exception: {str(e)}",
            similarity_score=0.0,
            ip_address=ip_addr,
            user_agent=ua
        )
        db.add(attempt)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to authenticate biometric input"
        )

@app.post("/api/v1/logout")
def logout():
    """Logout endpoint. Cleans up tokens on client-side."""
    return {"message": "Logged out successfully"}

@app.post("/api/v1/refresh-token", response_model=Token)
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Generates new access/refresh tokens using a valid refresh token."""
    decoded = jwt_service.verify_token(payload.refresh_token, expected_type="refresh")
    if not decoded:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
        
    username = decoded.get("sub")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User session expired"
        )
        
    user_response = UserResponse.from_orm(user)
    access_token = jwt_service.create_access_token(data={"sub": user.username})
    new_refresh_token = jwt_service.create_refresh_token(data={"sub": user.username})
    
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=user_response
    )
