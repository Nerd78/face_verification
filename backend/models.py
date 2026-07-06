import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True) # Optional password hash if MFA is enabled
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    embeddings = relationship("FaceEmbedding", back_populates="user", cascade="all, delete-orphan")
    login_attempts = relationship("LoginAttempt", back_populates="user", cascade="all, delete-orphan")

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    embedding = Column(Vector(512), nullable=False)  # 512-dimensional embedding from InsightFace
    quality_score = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="embeddings")

class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # Nullable if user lookup fails
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String, nullable=True)
    similarity_score = Column(Float, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="login_attempts")
