import base64
import cv2
import numpy as np
from insightface.app import FaceAnalysis
from backend.config import settings

class EmbeddingService:
    def __init__(self):
        # Initialize FaceAnalysis using buffalo_l
        # Run on CPU by default using CPUExecutionProvider
        self.app = FaceAnalysis(name='buffalo_l', root='/root/.insightface', providers=['CPUExecutionProvider'])
        # Prepare context (ctx_id=0 indicates GPU, -1 or CPU execution)
        self.app.prepare(ctx_id=-1, det_size=(640, 640))

    def base64_to_cv2(self, uri: str) -> np.ndarray:
        """Converts base64 image uri (data:image/jpeg;base64,...) to a CV2 BGR image."""
        if "," in uri:
            header, uri = uri.split(",", 1)
        image_data = base64.b64decode(uri)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img

    def detect_faces(self, img: np.ndarray):
        """Detects all faces in an image."""
        return self.app.get(img)

    def extract_embedding(self, face) -> list:
        """Extracts the 512-d normalized embedding from a face object."""
        if face is None or not hasattr(face, 'normed_embedding'):
            return None
        # Convert NumPy float32 array to standard Python float list
        return face.normed_embedding.tolist()

# Singleton instance
embedding_service = EmbeddingService()
