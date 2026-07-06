from typing import Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.models import FaceEmbedding, User
from backend.config import settings

class MatchingService:
    def check_duplicate_enrollment(self, db: Session, target_embedding: list) -> Tuple[bool, Optional[float], Optional[int]]:
        """
        Performs 1:N duplicate check.
        Returns (is_duplicate, max_similarity_score, duplicate_user_id)
        """
        # Calculate cosine similarity: 1 - cosine_distance (<=>)
        # We query the nearest embedding
        result = (
            db.query(
                FaceEmbedding.user_id,
                (1 - FaceEmbedding.embedding.cosine_distance(target_embedding)).label("similarity")
            )
            .order_by(FaceEmbedding.embedding.cosine_distance(target_embedding))
            .first()
        )
        
        if result:
            user_id, similarity = result
            if similarity is not None and similarity > settings.DUPLICATE_THRESHOLD:
                return True, float(similarity), user_id
            return False, float(similarity) if similarity is not None else 0.0, None
            
        return False, 0.0, None

    def verify_user_face(self, db: Session, user_id: int, target_embedding: list) -> Tuple[bool, float]:
        """
        Performs 1:1 face verification.
        Compares target embedding against all stored embeddings of the given user.
        Returns (is_verified, max_similarity_score)
        """
        # Get the maximum similarity amongst all embeddings stored for this user
        result = (
            db.query(
                func.max(1 - FaceEmbedding.embedding.cosine_distance(target_embedding)).label("max_similarity")
            )
            .filter(FaceEmbedding.user_id == user_id)
            .scalar()
        )
        
        if result is not None:
            max_similarity = float(result)
            is_verified = max_similarity >= settings.MATCH_THRESHOLD
            return is_verified, max_similarity
            
        return False, 0.0

matching_service = MatchingService()
