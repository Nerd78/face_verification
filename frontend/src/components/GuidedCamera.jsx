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

export default function GuidedCamera({ mode, userData, onComplete, onCancel }) {
  const webcamRef = useRef(null);
  
  // State Machine
  const [currentState, setCurrentState] = useState(STATES.CAMERA_LOADING);
  const [feedbackMsg, setFeedbackMsg] = useState('Starting camera...');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Active Challenge trackers
  const [activeChallenge, setActiveChallenge] = useState('smile');
  const [challengeProgress, setChallengeProgress] = useState(0); // 0 to 100%
  
  // Image captures collector
  const [capturedFrames, setCapturedFrames] = useState([]);
  
  // Enrollment Poses tracker
  const signupPoses = ['straight', 'left', 'right', 'up', 'down'];
  const [currentSignupPoseIndex, setCurrentSignupPoseIndex] = useState(0);
  
  // Stability timer (user holds still for 2 seconds)
  const [stabilityStartTime, setStabilityStartTime] = useState(null);
  const [stabilityPercentage, setStabilityPercentage] = useState(0);

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

  // Start webcam, choose a random challenge for login
  useEffect(() => {
    if (mode === 'login') {
      const randomChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
      setActiveChallenge(randomChallenge);
    } else {
      // For signup, our challenge is the pose variation itself (straight, left, right, up, down)
      setActiveChallenge(signupPoses[0]);
    }
    setCurrentState(STATES.CAMERA_LOADING);
  }, [mode]);

  // Main frame processing loop
  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const processFrame = async () => {
      if (!webcamRef.current || currentState === STATES.PROCESSING || currentState === STATES.SUCCESS || currentState === STATES.CAPTURING) {
        return;
      }

      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        if (isMounted) {
          setCurrentState(STATES.CAMERA_LOADING);
          setFeedbackMsg('Camera starting...');
        }
        return;
      }

      // Determine current challenge query
      // If signup, check current pose angle. If login, check active challenge.
      const currentTargetChallenge = mode === 'signup' ? signupPoses[currentSignupPoseIndex] : activeChallenge;

      try {
        const response = await fetch(`${API_URL}/api/v1/challenge/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge_type: currentTargetChallenge,
            frame_data: imageSrc
          })
        });

        if (!response.ok) {
          throw new Error('API server returned error');
        }

        const data = await response.json();

        if (!isMounted) return;

        if (data.success) {
          // Frame passed alignment, quality, and challenge verification!
          setFeedbackMsg(data.message || 'Hold still...');
          
          if (currentState !== STATES.ACTIVE_CHALLENGE) {
            setCurrentState(STATES.ACTIVE_CHALLENGE);
          }

          // Progress the challenge or stability indicator
          if (stabilityStartTime === null) {
            setStabilityStartTime(Date.now());
            setStabilityPercentage(0);
          } else {
            const elapsed = Date.now() - stabilityStartTime;
            const percentage = Math.min(100, (elapsed / 2000) * 100);
            setStabilityPercentage(percentage);

            if (elapsed >= 2000) {
              // 2 seconds of continuous stability passed -> Capture!
              setStabilityStartTime(null);
              setStabilityPercentage(0);
              handleCapture(imageSrc);
            }
          }
        } else {
          // Conditions failed, reset stability timer and update state/feedback
          setStabilityStartTime(null);
          setStabilityPercentage(0);

          const msg = data.message || 'Adjust position';
          setFeedbackMsg(msg);

          if (msg.includes('No face')) {
            setCurrentState(STATES.NO_FACE);
          } else if (msg.includes('Move') || msg.includes('outside')) {
            setCurrentState(STATES.ALIGNING_FACE);
          } else if (msg.includes('blurry') || msg.includes('Lighting')) {
            setCurrentState(STATES.QUALITY_CHECK);
          } else {
            setCurrentState(STATES.FACE_DETECTED);
          }
        }
      } catch (err) {
        console.error('Frame process error:', err);
        if (isMounted) {
          setFeedbackMsg('Connecting to backend...');
        }
      }
    };

    // Poll every 350ms to ensure low server overhead and responsive UI
    timer = setInterval(processFrame, 350);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [currentState, currentSignupPoseIndex, activeChallenge, stabilityStartTime, mode]);

  // Capture frame handler
  const handleCapture = (imageSrc) => {
    setCurrentState(STATES.CAPTURING);
    setFeedbackMsg('Capturing image...');

    if (mode === 'signup') {
      const updatedFrames = [...capturedFrames, imageSrc];
      setCapturedFrames(updatedFrames);
      
      const nextIndex = currentSignupPoseIndex + 1;
      if (nextIndex < signupPoses.length) {
        // Move to the next pose challenge
        setCurrentSignupPoseIndex(nextIndex);
        setActiveChallenge(signupPoses[nextIndex]);
        setCurrentState(STATES.FACE_DETECTED);
        setFeedbackMsg(`Capture successful! Now look ${signupPoses[nextIndex]}`);
      } else {
        // All 5 poses captured successfully! Send to backend signup route
        submitSignup(updatedFrames);
      }
    } else {
      // Login mode - captured single frame
      submitLogin(imageSrc);
    }
  };

  const submitSignup = async (frames) => {
    setCurrentState(STATES.PROCESSING);
    setFeedbackMsg('Submitting enrollment data...');
    try {
      const response = await fetch(`${API_URL}/api/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: userData.username,
          email: userData.email,
          password: userData.password,
          frames: frames,
          challenges_completed: signupPoses
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Signup failed');
      }

      setCurrentState(STATES.SUCCESS);
      setFeedbackMsg('Enrollment complete!');
      setTimeout(() => onComplete(data), 1500);
    } catch (err) {
      setCurrentState(STATES.NO_FACE);
      setErrorMessage(err.message || 'Failed during signup verification.');
    }
  };

  const submitLogin = async (frame) => {
    setCurrentState(STATES.PROCESSING);
    setFeedbackMsg('Authenticating profile...');
    try {
      const response = await fetch(`${API_URL}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username_or_email: userData.username,
          frame: frame,
          challenge_completed: activeChallenge
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      setCurrentState(STATES.SUCCESS);
      setFeedbackMsg(`Verified! Welcome ${data.token.user.username}`);
      setTimeout(() => onComplete(data), 1500);
    } catch (err) {
      setCurrentState(STATES.NO_FACE);
      setErrorMessage(err.message || 'Access Denied.');
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
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, margin: 0 }}>
            {mode === 'signup' ? 'Face Enrollment Setup' : 'Liveness Challenge'}
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {mode === 'signup' ? `Pose ${currentSignupPoseIndex + 1} of 5` : 'Active challenge verification'}
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>

      {errorMessage && (
        <div className="alert alert-error" style={{ width: '100%', margin: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            <ShieldAlert size={16} /> Error
          </div>
          {errorMessage}
          <button onClick={resetCapture} className="btn-primary" style={{ marginTop: '0.75rem', padding: '0.5rem', fontSize: '0.875rem' }}>
            Retry Capture
          </button>
        </div>
      )}

      {/* Camera box container */}
      <div style={{ position: 'relative', width: '380px', height: '420px', borderRadius: '16px', overflow: 'hidden', background: '#000' }}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{
            width: 640,
            height: 480,
            facingMode: "user"
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* Guided SVG overlay */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <defs>
            <mask id="camera-guide-mask">
              <rect width="100%" height="100%" fill="white" />
              {/* Centered oval cutout */}
              <ellipse cx="190" cy="190" rx="90" ry="120" fill="black" />
            </mask>
          </defs>
          
          {/* Semi-transparent Darkened overlay outside the oval */}
          <rect width="100%" height="100%" fill="rgba(11, 12, 16, 0.75)" mask="url(#camera-guide-mask)" />
          
          {/* Status color border ring */}
          <ellipse
            cx="190"
            cy="190"
            rx="90"
            ry="120"
            fill="none"
            stroke={getStatusColor()}
            strokeWidth="4"
            style={{ transition: 'stroke 0.3s ease' }}
          />

          {/* Animated stability progress arc */}
          {stabilityPercentage > 0 && (
            <ellipse
              cx="190"
              cy="190"
              rx="90"
              ry="120"
              fill="none"
              stroke="var(--status-green)"
              strokeWidth="4"
              strokeDasharray={`${(stabilityPercentage / 100) * 660} 660`}
              style={{ transition: 'stroke-dasharray 0.1s linear', transform: 'rotate(-90deg)', transformOrigin: '190px 190px' }}
            />
          )}
        </svg>

        {/* Challenge prompt box overlays */}
        {currentState === STATES.ACTIVE_CHALLENGE && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(59, 130, 246, 0.95)',
            color: 'white',
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
            animation: 'pulse 1.5s infinite'
          }}>
            Challenge: {activeChallenge}
          </div>
        )}
      </div>

      {/* Info board footer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '0.5rem' }}>
        <div style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '1.25rem',
          fontWeight: 700,
          textAlign: 'center',
          color: getStatusColor(),
          transition: 'color 0.3s ease'
        }}>
          {getChallengeInstructions()}
        </div>

        <div style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.03)',
          padding: '0.6rem 1.25rem',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.05)',
          minWidth: '280px'
        }}>
          {feedbackMsg}
        </div>

        {/* Step dots for signup */}
        {mode === 'signup' && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            {signupPoses.map((p, idx) => (
              <div
                key={p}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: idx < currentSignupPoseIndex 
                    ? 'var(--status-green)' 
                    : idx === currentSignupPoseIndex 
                      ? 'var(--status-blue)' 
                      : 'rgba(255,255,255,0.2)',
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
