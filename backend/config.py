import os
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field(
        default="postgresql://face_auth_user:face_auth_password@db:5432/face_auth_db",
        validation_alias="DATABASE_URL"
    )
    
    # JWT Auth Configuration
    JWT_SECRET: str = Field(
        default="super_secret_jwt_key_change_me_in_production_12345",
        validation_alias="JWT_SECRET"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Biometric Recognition Thresholds (Similarity values)
    DUPLICATE_THRESHOLD: float = 0.82
    MATCH_THRESHOLD: float = 0.80
    
    # Face Quality Thresholds
    MIN_FACE_CONFIDENCE: float = 0.5
    MIN_BRIGHTNESS: float = 50.0  # Mean pixel brightness (0-255)
    MAX_BRIGHTNESS: float = 230.0
    MIN_BLUR_LAPLACIAN_VAR: float = 80.0  # Higher var = sharper image
    MAX_POSE_YAW: float = 25.0  # Max degrees yaw for front shot
    MAX_POSE_PITCH: float = 20.0 # Max degrees pitch for front shot
    MAX_POSE_ROLL: float = 15.0  # Max degrees roll for front shot
    
    # Guide / Bounding Box Alignment
    MIN_FACE_AREA_RATIO: float = 0.03  # Face bounding box area relative to image
    MAX_FACE_AREA_RATIO: float = 0.60
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
