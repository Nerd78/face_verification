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
        """
        Runs validation checks for brightness, blur, confidence, and pose.
        Computes a frame quality score between 0 and 100.
        """
        confidence = float(face.det_score) if hasattr(face, 'det_score') else 0.0
        bright_ok, brightness, bright_msg = self.evaluate_brightness(img)
        blur_ok, blur_score, blur_msg = self.evaluate_blur(img)
        pose_ok, pose_data, pose_msg = self.evaluate_pose(face, target_pose)

        # 1. Base Score calculation (Starts at 100)
        score = 100.0

        # Confidence deduction (up to 30 pts)
        score -= (1.0 - confidence) * 30.0

        # Brightness deduction (up to 20 pts)
        if brightness < 80:
            score -= (80 - brightness) * 0.4
        elif brightness > 200:
            score -= (brightness - 200) * 0.3

        # Blur deduction (up to 30 pts)
        if blur_score < settings.MIN_BLUR_LAPLACIAN_VAR:
            # Under threshold, deduct points proportionally
            score -= min(30.0, (settings.MIN_BLUR_LAPLACIAN_VAR - blur_score) * 0.5)
        else:
            # Over threshold, give small bonus for extra sharp images (max 5 pts)
            score += min(5.0, (blur_score - settings.MIN_BLUR_LAPLACIAN_VAR) * 0.01)

        # Pose deduction (up to 20 pts)
        if pose_data:
            yaw = abs(pose_data.get("yaw", 0))
            pitch = abs(pose_data.get("pitch", 0))
            roll = abs(pose_data.get("roll", 0))
            
            if target_pose == "straight":
                score -= (yaw * 0.5 + pitch * 0.5 + roll * 0.5)
            elif target_pose in ["left", "right"]:
                # If target is left/right, we expect yaw to be ~15-30. If it deviates, deduct.
                yaw_dev = abs(yaw - 20.0)
                score -= (yaw_dev * 0.6 + pitch * 0.5 + roll * 0.5)
            elif target_pose in ["up", "down"]:
                pitch_dev = abs(pitch - 15.0)
                score -= (yaw * 0.5 + pitch_dev * 0.6 + roll * 0.5)

        # Ensure score is strictly between 0 and 100
        final_score = max(0.0, min(100.0, score))

        # Check if all critical checks are satisfied
        critical_success = confidence >= settings.MIN_FACE_CONFIDENCE and bright_ok and blur_ok and pose_ok

        # Determine highest-priority failure reason
        reason = "All quality checks passed"
        if not critical_success:
            if confidence < settings.MIN_FACE_CONFIDENCE:
                reason = "Low face confidence"
            elif not bright_ok:
                reason = bright_msg
            elif not blur_ok:
                reason = blur_msg
            elif not pose_ok:
                reason = pose_msg

        return {
            "success": critical_success,
            "reason": reason,
            "quality_score": round(final_score, 1),
            "scores": {
                "confidence": confidence,
                "brightness": brightness,
                "blur": blur_score,
                "pose": pose_data
            }
        }

quality_service = QualityService()
