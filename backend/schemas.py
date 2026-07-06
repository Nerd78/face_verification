from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# JWT schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    username: Optional[str] = None

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Biometric request schemas
class BiometricChallengeCheck(BaseModel):
    challenge_type: str  # e.g., 'blink', 'smile', 'left', 'right', 'up', 'down'
    frame_data: str      # Base64-encoded image string

class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str = Field(..., min_length=6)
    frames: List[str]  # 3-5 base64 images (poses)
    challenges_completed: List[str]  # List of challenges completed during session

class LoginRequest(BaseModel):
    username_or_email: str
    password: str
    frame: str  # Base64 login face image
    challenge_completed: str # The challenge completed for verification

class LoginResponse(BaseModel):
    success: bool
    message: str
    similarity_score: Optional[float] = None
    token: Optional[Token] = None
