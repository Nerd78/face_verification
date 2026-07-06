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
        Validates that the face is centered and matches appropriate sizing relative to the image frame.
        """
        # Get bounding box [x1, y1, x2, y2]
        bbox = face.bbox
        x1, y1, x2, y2 = bbox
        
        # 1. Centering Check
        face_center_x = (x1 + x2) / 2
        face_center_y = (y1 + y2) / 2
        
        frame_center_x = img_w / 2
        frame_center_y = img_h / 2
        
        # Max deviations: 20% of width/height (relaxed slightly for comfort)
        max_dev_x = img_w * 0.20
        max_dev_y = img_h * 0.20
        
        if abs(face_center_x - frame_center_x) > max_dev_x:
            if face_center_x < frame_center_x:
                return False, "Move right"
            else:
                return False, "Move left"
                
        if abs(face_center_y - frame_center_y) > max_dev_y:
            if face_center_y < frame_center_y:
                return False, "Move down"
            else:
                return False, "Move up"

        # 2. Distance Check (Bounding box area compared to image area)
        face_w = x2 - x1
        face_h = y2 - y1
        face_area = face_w * face_h
        img_area = img_w * img_h
        area_ratio = face_area / img_area
        
        if area_ratio < settings.MIN_FACE_AREA_RATIO:
            return False, "Move closer"
        if area_ratio > settings.MAX_FACE_AREA_RATIO:
            return False, "Move farther"
            
        return True, "Face aligned"

camera_validation_service = CameraValidationService()
