import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Workflow states
const STATES = {
  CAMERA_LOADING: 'CAMERA_LOADING',
  NO_FACE: 'NO_FACE',
  FACE_DETECTED: 'FACE_DETECTED',
  ALIGNING_FACE: 'ALIGNING_FACE',
  QUALITY_CHECK: 'QUALITY_CHECK',
  ACTIVE_CHALLENGE: 'ACTIVE_CHALLENGE',
  CAPTURING: 'CAPTURING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS'
};

const CHALLENGES = ['smile', 'blink', 'left', 'right', 'up', 'down'];

export default function GuidedCamera({ mode, isEnrollOnly, userData, onComplete, onCancel }) {
  const webcamRef = useRef(null);
  
  // State Machine
  const [currentState, setCurrentState] = useState(STATES.FACE_DETECTED);
  const [feedbackMsg, setFeedbackMsg] = useState('Position your face inside the capture area.');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Image captures collector
  const [capturedFrames, setCapturedFrames] = useState([]);
  
  const signupPoses = ['straight'];
  const [currentSignupPoseIndex, setCurrentSignupPoseIndex] = useState(0);

  // Status colors based on state
  const getStatusColor = () => {
    switch (currentState) {
      case STATES.CAMERA_LOADING:
        return 'var(--status-gray)';
      case STATES.NO_FACE:
      case STATES.ALIGNING_FACE:
        return 'var(--status-yellow)';
      case STATES.FACE_DETECTED:
      case STATES.QUALITY_CHECK:
      case STATES.ACTIVE_CHALLENGE:
        return 'var(--status-blue)';
      case STATES.CAPTURING:
      case STATES.SUCCESS:
        return 'var(--status-green)';
      default:
        return 'var(--status-red)';
    }
  };

  // Manual Shutter Capture trigger
  const triggerManualCapture = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setErrorMessage('');
    setCurrentState(STATES.PROCESSING);
    setFeedbackMsg('Processing captured photo...');

    if (mode === 'signup') {
      // For enrollment, validate frame directly during submission
      submitSignup([imageSrc]);
    } else {
      // For login, validate frame directly during login
      submitLogin(imageSrc);
    }
  };

  const submitSignup = async (frames) => {
    try {
      const endpoint = isEnrollOnly ? `${API_URL}/api/v1/users/enroll-face` : `${API_URL}/api/v1/signup`;
      const signupBody = isEnrollOnly ? {
        username_or_email: userData.username,
        password: userData.password,
        frames: frames,
        challenges_completed: signupPoses
      } : {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        frames: frames,
        challenges_completed: signupPoses
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupBody)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Biometric validation failed. Make sure your face is visible, sharp, and centered.');
      }

      setCurrentState(STATES.SUCCESS);
      setFeedbackMsg('Biometrics captured and enrolled successfully!');
      setTimeout(() => onComplete(data), 1500);
    } catch (err) {
      setCurrentState(STATES.FACE_DETECTED);
      setErrorMessage(err.message || 'Verification failed. Please try again.');
      setFeedbackMsg('Capture rejected.');
    }
  };

  const submitLogin = async (frame) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username_or_email: userData.username,
          password: userData.password,
          frame: frame,
          challenge_completed: 'straight' // Default verification challenge
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Verification failed. Make sure your face is centered and matches your registered profile.');
      }

      setCurrentState(STATES.SUCCESS);
      setFeedbackMsg(`Verified! Welcome ${data.token.user.username}`);
      setTimeout(() => onComplete(data), 1500);
    } catch (err) {
      setCurrentState(STATES.FACE_DETECTED);
      setErrorMessage(err.message || 'Access Denied. Please try again.');
      setFeedbackMsg('Capture rejected.');
    }
  };

  const resetCapture = () => {
    setCapturedFrames([]);
    setCurrentSignupPoseIndex(0);
    setErrorMessage('');
    setCurrentState(STATES.CAMERA_LOADING);
    if (mode === 'signup') {
      setActiveChallenge(signupPoses[0]);
    } else {
      const randomChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
      setActiveChallenge(randomChallenge);
    }
  };

  // Convert challenge type to human readable instructions
  const getChallengeInstructions = () => {
    if (mode === 'signup') {
      switch (signupPoses[currentSignupPoseIndex]) {
        case 'straight': return 'Look directly into the camera';
        case 'left': return 'Turn your head slightly to the left';
        case 'right': return 'Turn your head slightly to the right';
        case 'up': return 'Look slightly upwards';
        case 'down': return 'Look slightly downwards';
        default: return 'Position your face inside the oval';
      }
    } else {
      switch (activeChallenge) {
        case 'smile': return 'Please Smile widely';
        case 'blink': return 'Blink your eyes fully';
        case 'left': return 'Turn your head to the left';
        case 'right': return 'Turn your head to the right';
        case 'up': return 'Tilt your head up';
        case 'down': return 'Tilt your head down';
        default: return 'Complete challenge prompt';
      }
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* Full-screen webcam background */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{
            width: 1280,
            height: 720,
            facingMode: "user"
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* Static Premium Vignette Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 150px rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 10006
        }} />

        {/* Modern Biometric Capture Frame Bracket Target */}
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '440px',
          height: '500px',
          border: '1px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '24px',
          zIndex: 10004,
          pointerEvents: 'none',
          boxShadow: '0 0 40px rgba(0,0,0,0.5)'
        }}>
          {/* Vertical static sweep laser line */}
          <div className="scanner-laser-line" style={{ '--laser-color': '#3b82f6' }} />

          {/* Glowing tech-brackets at the corners (Static white/gray) */}
          {/* Top Left Anchor */}
          <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '28px', height: '28px', borderTop: '4px solid rgba(255,255,255,0.7)', borderLeft: '4px solid rgba(255,255,255,0.7)', borderTopLeftRadius: '18px' }} />
          {/* Top Right Anchor */}
          <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '28px', height: '28px', borderTop: '4px solid rgba(255,255,255,0.7)', borderRight: '4px solid rgba(255,255,255,0.7)', borderTopRightRadius: '18px' }} />
          {/* Bottom Left Anchor */}
          <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '28px', height: '28px', borderBottom: '4px solid rgba(255,255,255,0.7)', borderLeft: '4px solid rgba(255,255,255,0.7)', borderBottomLeftRadius: '18px' }} />
          {/* Bottom Right Anchor */}
          <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '28px', height: '28px', borderBottom: '4px solid rgba(255,255,255,0.7)', borderRight: '4px solid rgba(255,255,255,0.7)', borderBottomRightRadius: '18px' }} />
        </div>
      </div>

      {/* Top Header Overlay */}
      <div style={{
        position: 'absolute',
        top: '30px',
        left: '24px',
        right: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10010
      }}>
        <div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.8)', fontSize: '1.4rem' }}>
            {mode === 'signup' ? 'Face Enrollment Setup' : 'Liveness Verification'}
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            Biometric verification target
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-primary)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.6rem 1.25rem',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'background 0.2s'
          }}
        >
          Cancel
        </button>
      </div>

      {/* Error alert HUD popup */}
      {errorMessage && (
        <div className="alert alert-error" style={{
          position: 'absolute',
          top: '110px',
          width: '90%',
          maxWidth: '360px',
          zIndex: 10020,
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          background: 'rgba(239, 68, 68, 0.95)',
          color: 'white',
          border: 'none',
          backdropFilter: 'blur(16px)',
          margin: 0
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            <ShieldAlert size={18} /> Error
          </div>
          <div style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>{errorMessage}</div>
          <button onClick={() => { setErrorMessage(''); setFeedbackMsg('Position your face inside the capture area.'); }} className="btn-primary" style={{ padding: '0.5rem', fontSize: '0.875rem', background: 'white', color: '#ef4444' }}>
            Try Again
          </button>
        </div>
      )}

      {/* Bottom HUD overlay for Guidance */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.8rem',
        zIndex: 10010
      }}>
        {/* Shutter Capture Button */}
        <button
          onClick={triggerManualCapture}
          disabled={currentState === STATES.PROCESSING || currentState === STATES.CAPTURING}
          style={{
            background: 'radial-gradient(circle, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            border: '4px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            outline: 'none',
            marginBottom: '0.5rem'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'white',
            boxShadow: 'inset 0 0 5px rgba(0,0,0,0.3)'
          }} />
        </button>
        <div style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '1.45rem',
          fontWeight: 800,
          textAlign: 'center',
          color: '#fff',
          textShadow: '0 2px 5px rgba(0,0,0,0.9)',
          transition: 'color 0.3s ease'
        }}>
          {mode === 'signup' ? 'Face Enrollment Setup' : 'Face Verification Access'}
        </div>

        <div style={{
          fontSize: '0.95rem',
          color: '#fff',
          textAlign: 'center',
          background: 'rgba(18, 20, 28, 0.85)',
          backdropFilter: 'blur(16px)',
          padding: '0.8rem 1.5rem',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: '290px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
        }}>
          {feedbackMsg}
        </div>

        {/* Step progress dots for enrollment */}
        {mode === 'signup' && (
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem' }}>
            {signupPoses.map((p, idx) => (
              <div
                key={p}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: idx < currentSignupPoseIndex 
                    ? 'var(--status-green)' 
                    : idx === currentSignupPoseIndex 
                      ? 'var(--status-blue)' 
                      : 'rgba(255,255,255,0.3)',
                  transition: 'background 0.3s ease'
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
