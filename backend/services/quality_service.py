from typing import Tuple, Dict, Any
import cv2
import numpy as np
from backend.config import settings

class QualityService:
    def evaluate_brightness(self, img: np.ndarray) -> Tuple[bool, float, str]:
        """Calculates image brightness and checks if it falls within valid thresholds."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        
        if brightness < settings.MIN_BRIGHTNESS:
            return False, brightness, "Lighting too dark"
        if brightness > settings.MAX_BRIGHTNESS:
            return False, brightness, "Lighting too bright"
            
        return True, brightness, "Good lighting"

    def evaluate_blur(self, img: np.ndarray) -> Tuple[bool, float, str]:
        """
        Calculates image blur using the Laplacian variance method.
        Higher variance indicates sharper images.
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        
        if blur_score < settings.MIN_BLUR_LAPLACIAN_VAR:
            return False, blur_score, "Face blurry"
            
        return True, blur_score, "Image sharp"

    def evaluate_pose(self, face, target_pose: str = "straight") -> Tuple[bool, dict, str]:
        """
        Evaluates the face's rotation (pitch, yaw, roll) to ensure it is facing the correct direction.
        target_pose can be 'straight', 'left', 'right', 'up', 'down'.
        """
        if face is None or not hasattr(face, 'pose'):
            return False, {}, "Cannot estimate pose"
            
        # pose contains [pitch, yaw, roll] in degrees
        pitch, yaw, roll = face.pose
        
        pose_data = {
            "pitch": float(pitch),
            "yaw": float(yaw),
            "roll": float(roll)
        }
        
        # Roll should always remain relatively stable (face not tilted sideways)
        if abs(roll) > settings.MAX_POSE_ROLL:
            return False, pose_data, "Hold head straight (no side tilt)"
            
        if target_pose == "straight":
            if abs(yaw) > settings.MAX_POSE_YAW:
                return False, pose_data, f"Look straight (yaw: {yaw:.1f})"
            if abs(pitch) > settings.MAX_POSE_PITCH:
                return False, pose_data, f"Look straight (pitch: {pitch:.1f})"
                
        elif target_pose == "left":
            # InsightFace: Turn head left -> yaw is positive (towards right side of image)
            # Let's check: yaw should be greater than a threshold, e.g., yaw > 10.0 or 15.0
            if yaw < 10.0:
                return False, pose_data, "Turn head slightly left"
            if yaw > 40.0:
                return False, pose_data, "Turn head back slightly"
                
        elif target_pose == "right":
            # Turn head right -> yaw is negative
            if yaw > -10.0:
                return False, pose_data, "Turn head slightly right"
            if yaw < -40.0:
                return False, pose_data, "Turn head back slightly"
                
        elif target_pose == "up":
            # Look up -> pitch is positive (tilted upwards)
            if pitch < 8.0:
                return False, pose_data, "Look slightly up"
            if pitch > 35.0:
                return False, pose_data, "Look down slightly"
                
        elif target_pose == "down":
            # Look down -> pitch is negative (tilted downwards)
            if pitch > -8.0:
                return False, pose_data, "Look slightly down"
            if pitch < -35.0:
                return False, pose_data, "Look up slightly"
                
        return True, pose_data, f"Pose validation successful ({target_pose})"

    def run_all_quality_checks(self, img: np.ndarray, face, target_pose: str = "straight") -> Dict[str, Any]:
        """Runs validation checks for brightness, blur, confidence, and pose."""
        # Check detection confidence
        confidence = float(face.det_score) if hasattr(face, 'det_score') else 0.0
        if confidence < settings.MIN_FACE_CONFIDENCE:
            return {"success": False, "reason": "Low face confidence", "scores": {"confidence": confidence}}

        bright_ok, brightness, bright_msg = self.evaluate_brightness(img)
        if not bright_ok:
            return {"success": False, "reason": bright_msg, "scores": {"brightness": brightness, "confidence": confidence}}

        blur_ok, blur_score, blur_msg = self.evaluate_blur(img)
        if not blur_ok:
            return {"success": False, "reason": blur_msg, "scores": {"brightness": brightness, "blur": blur_score, "confidence": confidence}}

        pose_ok, pose_data, pose_msg = self.evaluate_pose(face, target_pose)
        if not pose_ok:
            return {"success": False, "reason": pose_msg, "scores": {"brightness": brightness, "blur": blur_score, "confidence": confidence, "pose": pose_data}}

        return {
            "success": True,
            "reason": "All quality checks passed",
            "scores": {
                "confidence": confidence,
                "brightness": brightness,
                "blur": blur_score,
                "pose": pose_data
            }
        }

quality_service = QualityService()
