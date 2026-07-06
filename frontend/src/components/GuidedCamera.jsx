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
  const bufferRef = useRef([]); // Rolling buffer of successful frames: { imageSrc, score }
  
  // State Machine
  const [currentState, setCurrentState] = useState(STATES.CAMERA_LOADING);
  const [feedbackMsg, setFeedbackMsg] = useState('Starting camera...');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Active Challenge trackers
  const [activeChallenge, setActiveChallenge] = useState('smile');
  const activeChallengeRef = useRef('smile');
  const [challengeProgress, setChallengeProgress] = useState(0); // 0 to 100%
  
  // Image captures collector
  const [capturedFrames, setCapturedFrames] = useState([]);
  
  const signupPoses = ['straight'];
  const [currentSignupPoseIndex, setCurrentSignupPoseIndex] = useState(0);
  const currentSignupPoseIndexRef = useRef(0);
  
  // Stability timer (user holds still for 2 seconds) using Refs for continuous intervals
  const stabilityStartTimeRef = useRef(null);
  const [stabilityPercentage, setStabilityPercentage] = useState(0);

  // Sync state to refs so the polling loop always has fresh data
  useEffect(() => {
    activeChallengeRef.current = activeChallenge;
  }, [activeChallenge]);

  useEffect(() => {
    currentSignupPoseIndexRef.current = currentSignupPoseIndex;
  }, [currentSignupPoseIndex]);

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
    bufferRef.current = [];
    stabilityStartTimeRef.current = null;
    setStabilityPercentage(0);
  }, [mode]);

  // Main frame processing loop
  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const processFrame = async () => {
      // We read currentState directly from the ref or let it run
      // Since uvicorn or API calls might take time, block if processing
      if (!webcamRef.current) return;

      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        if (isMounted) {
          setFeedbackMsg('Camera starting...');
        }
        return;
      }

      // Read values from refs to avoid stale closures
      const currentPoseIdx = currentSignupPoseIndexRef.current;
      const currentTargetChallenge = mode === 'signup' ? signupPoses[currentPoseIdx] : activeChallengeRef.current;

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
          setFeedbackMsg('Capturing...');
          setCurrentState(STATES.CAPTURING);
          handleCapture(imageSrc);
        } else {
          // Conditions failed, reset state/feedback
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

    // Poll every 350ms. Note: dependency array is empty so the interval is never reset
    timer = setInterval(processFrame, 350);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [mode]);

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
    setFeedbackMsg(isEnrollOnly ? 'Submitting biometric enrollment...' : 'Submitting enrollment data...');
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
        throw new Error(data.detail || 'Enrollment failed');
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
          password: userData.password,
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

        {/* Dynamic Vignette Glow around the screen edges */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          boxShadow: `inset 0 0 100px rgba(${
            currentState === STATES.ACTIVE_CHALLENGE || currentState === STATES.SUCCESS ? '16, 185, 129' :
            currentState === STATES.FACE_DETECTED || currentState === STATES.QUALITY_CHECK ? '59, 130, 246' :
            currentState === STATES.ALIGNING_FACE || currentState === STATES.NO_FACE ? '245, 158, 11' :
            '107, 114, 128'
          }, 0.2)`,
          border: `5px solid ${getStatusColor()}`,
          zIndex: 10006,
          transition: 'all 0.3s ease'
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
          boxShadow: '0 0 40px rgba(0,0,0,0.4)',
          transition: 'all 0.3s ease'
        }}>
          {/* Vertical dynamic sweep laser line */}
          <div className="scanner-laser-line" style={{ '--laser-color': getStatusColor() }} />

          {/* Glowing tech-brackets at the corners */}
          {/* Top Left Anchor */}
          <div style={{ position: 'absolute', top: '-3px', left: '-3px', width: '28px', height: '28px', borderTop: `4px solid ${getStatusColor()}`, borderLeft: `4px solid ${getStatusColor()}`, borderTopLeftRadius: '18px', transition: 'border-color 0.3s' }} />
          {/* Top Right Anchor */}
          <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '28px', height: '28px', borderTop: `4px solid ${getStatusColor()}`, borderRight: `4px solid ${getStatusColor()}`, borderTopRightRadius: '18px', transition: 'border-color 0.3s' }} />
          {/* Bottom Left Anchor */}
          <div style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '28px', height: '28px', borderBottom: `4px solid ${getStatusColor()}`, borderLeft: `4px solid ${getStatusColor()}`, borderBottomLeftRadius: '18px', transition: 'border-color 0.3s' }} />
          {/* Bottom Right Anchor */}
          <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '28px', height: '28px', borderBottom: `4px solid ${getStatusColor()}`, borderRight: `4px solid ${getStatusColor()}`, borderBottomRightRadius: '18px', transition: 'border-color 0.3s' }} />

          {/* Stability progress perimeter ring */}
          {stabilityPercentage > 0 && (
            <svg style={{ position: 'absolute', top: '-10px', left: '-10px', width: '460px', height: '520px' }}>
              <rect
                x="2"
                y="2"
                width="456"
                height="516"
                rx="22"
                fill="none"
                stroke="var(--status-green)"
                strokeWidth="4"
                strokeDasharray={`${(stabilityPercentage / 100) * 1944} 1944`}
                style={{ transition: 'stroke-dasharray 0.1s linear' }}
              />
            </svg>
          )}
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
            {mode === 'signup' ? 'Face Enrollment Setup' : 'Liveness Challenge'}
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            {mode === 'signup' ? `Pose ${currentSignupPoseIndex + 1} of 5` : 'Active challenge verification'}
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

      {/* Challenge title overlay */}
      {currentState === STATES.ACTIVE_CHALLENGE && (
        <div style={{
          position: 'absolute',
          top: '110px',
          background: 'rgba(59, 130, 246, 0.95)',
          color: 'white',
          padding: '0.4rem 1.2rem',
          borderRadius: '20px',
          fontSize: '0.85rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
          zIndex: 10015,
          animation: 'pulse 1.5s infinite'
        }}>
          Challenge: {activeChallenge}
        </div>
      )}

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
          <button onClick={resetCapture} className="btn-primary" style={{ padding: '0.5rem', fontSize: '0.875rem', background: 'white', color: '#ef4444' }}>
            Retry Capture
          </button>
        </div>
      )}

      {/* Bottom HUD overlay for Guidance */}
      <div style={{
        position: 'absolute',
        bottom: '50px',
        left: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.8rem',
        zIndex: 10010
      }}>
        <div style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '1.45rem',
          fontWeight: 800,
          textAlign: 'center',
          color: getStatusColor(),
          textShadow: '0 2px 5px rgba(0,0,0,0.9)',
          transition: 'color 0.3s ease'
        }}>
          {getChallengeInstructions()}
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
