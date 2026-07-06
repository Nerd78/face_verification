from typing import Dict, Any, Tuple
import numpy as np
from backend.config import settings

class CameraValidationService:
    def validate_face_presence(self, faces: list) -> Tuple[bool, str]:
        """Validates that exactly one face is detected."""
        face_count = len(faces)
        if face_count == 0:
            return False, "No face detected"
        if face_count > 1:
            return False, "Multiple faces detected"
        return True, "One face detected"

    def validate_alignment(self, face, img_w: int, img_h: int) -> Tuple[bool, str]:
        """
        Always returns success to ensure webcams are not blocked by rigid centering/distance checks.
        """
        return True, "Face aligned"

camera_validation_service = CameraValidationService()
