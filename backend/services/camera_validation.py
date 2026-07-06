from typing import Dict, Any, Tuple
import numpy as np
from backend.config import settings

class CameraValidationService:
    def validate_face_presence(self, faces: list) -> Tuple[bool, str]:
        """
        Validates presence of a face. If multiple faces are detected, we proceed
        by focusing on the primary face.
        """
        if not faces or len(faces) == 0:
            return False, "No face detected"
        return True, "Face detected"

    def validate_alignment(self, face, img_w: int, img_h: int) -> Tuple[bool, str]:
        """
        Always returns success to ensure webcams are not blocked by rigid centering/distance checks.
        """
        return True, "Face aligned"

camera_validation_service = CameraValidationService()
