from datetime import datetime, timedelta
from typing import Optional, Dict
from jose import JWTError, jwt
from passlib.context import CryptContext
from backend.config import settings

# Setup password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class JWTService:
    def hash_password(self, password: str) -> str:
        """Hashes a raw password."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verifies a plain password against a hashed one."""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Creates a short-lived access token."""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire, "type": "access"})
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return encoded_jwt

    def create_refresh_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Creates a long-lived refresh token."""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            
        to_encode.update({"exp": expire, "type": "refresh"})
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return encoded_jwt

    def verify_token(self, token: str, expected_type: str = "access") -> Optional[dict]:
        """
        Decodes and verifies a JWT token.
        Ensures the signature, expiration, and token types are valid.
        """
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            token_type = payload.get("type")
            if token_type != expected_type:
                return None
            return payload
        except JWTError:
            return None

jwt_service = JWTService()
