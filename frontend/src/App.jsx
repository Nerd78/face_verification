import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, UserCheck, Key, RefreshCw, FileText, CheckCircle } from 'lucide-react';
import AuthForm from './components/AuthForm';
import GuidedCamera from './components/GuidedCamera';

export default function App() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [showCamera, setShowCamera] = useState(false);
  const [userData, setUserData] = useState(null); // stores credentials entered before opening camera
  
  // Auth state
  const [userSession, setUserSession] = useState(null); // stores JWT and User details
  const [sessionLogs, setSessionLogs] = useState([]);
  
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleAuthSubmit = async (data) => {
    setFormError('');
    if (mode === 'login') {
      setFormLoading(true);
      try {
        const apiHost = import.meta.env.VITE_API_URL || 'http://localhost:8001';
        const response = await fetch(`${apiHost}/api/v1/users/check-registered?username_or_email=${encodeURIComponent(data.username)}`);
        const resData = await response.json();
        
        if (!response.ok) {
          throw new Error(resData.detail || 'Profile search failed');
        }
        
        // Update username with exact canonical name
        data.username = resData.username || data.username;
        setUserData(data);
        setShowCamera(true);
      } catch (err) {
        setFormError(err.message);
      } finally {
        setFormLoading(false);
      }
    } else {
      setUserData(data);
      setShowCamera(true);
    }
  };

  const handleCaptureComplete = (result) => {
    setShowCamera(false);
    setUserData(null);
    
    if (mode === 'signup') {
      alert('Enrollment Successful! You can now log in using facial recognition.');
      setMode('login');
    } else {
      // Login completed successfully
      setUserSession(result.token);
      // Save logs locally
      const log = {
        time: new Date().toLocaleTimeString(),
        score: result.similarity_score,
        msg: result.message
      };
      setSessionLogs(prev => [log, ...prev]);
    }
  };

  const handleLogout = () => {
    setUserSession(null);
    setMode('login');
    setShowCamera(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header navbar */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={32} color="#3b82f6" />
          <div>
            <h1 style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 800,
              fontSize: '1.4rem',
              letterSpacing: '0.5px',
              margin: 0
            }}>
              BIOMETRIC<span style={{ color: '#10b981' }}>GUARD</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              Biometric Access & Multi-factor Enrollment Platform
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ color: 'var(--text-secondary)' }}>System Active: buffalo_l</span>
        </div>
      </header>

      {/* Main Grid */}
      {userSession ? (
        // Logged-in Dashboard
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              borderRadius: '50%',
              padding: '1.25rem',
              display: 'inline-flex'
            }}>
              <CheckCircle size={48} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '2rem' }}>
                Access Authorized
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Profile: <strong style={{ color: 'white' }}>{userSession.user.username}</strong> ({userSession.user.email})
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', width: '100%' }}>
            {/* Session Token Info */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#3b82f6' }}>
                <Key size={18} /> JSON Web Token
              </h4>
              <div style={{
                background: '#07080c',
                padding: '1rem',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
                maxHeight: '120px',
                overflowY: 'auto'
              }}>
                {userSession.access_token}
              </div>
            </div>

            {/* Verification audit log */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#10b981' }}>
                <FileText size={18} /> Verification History
              </h4>
              {sessionLogs.length === 0 ? (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>No logs for this session.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {sessionLogs.map((log, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                      background: 'rgba(255,255,255,0.02)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px'
                    }}>
                      <span>{log.time} - {log.msg}</span>
                      <strong style={{ color: '#10b981' }}>Match: {(log.score * 100).toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={handleLogout} className="btn-primary" style={{ background: '#ef4444', width: '200px', alignSelf: 'center' }}>
            Revoke Access Session
          </button>
        </div>
      ) : (
        // Auth Grid Layout
        <main className="app-container">
          {/* Left panel (Form or Camera) */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            {showCamera ? (
              <GuidedCamera
                mode={mode}
                userData={userData}
                onComplete={handleCaptureComplete}
                onCancel={() => { setShowCamera(false); setUserData(null); }}
              />
            ) : (
              <AuthForm
                onSubmit={handleAuthSubmit}
                mode={mode}
                setMode={setMode}
                loading={formLoading}
                externalError={formError}
              />
            )}
          </div>

          {/* Right panel (Architecture & Features overview) */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.6rem' }}>
              High-Precision Facial Recognition
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5', fontSize: '0.95rem' }}>
              BiometricGuard implements **InsightFace (buffalo_l)** and active facial challenge checks (yaw/pitch pose detection, blinks, and smiles) to verify user identity.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: '12px', padding: '0.5rem', display: 'flex' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, marginBottom: '0.25rem' }}>Active Anti-Spoofing</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Verifies movement (blinking, smiling, turning left/right) using dynamic facial landmarks.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderRadius: '12px', padding: '0.5rem', display: 'flex' }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, marginBottom: '0.25rem' }}>1:N Duplicate Search</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Signup performs database-wide search via 512-dimensional pgvector comparison to reject duplicate profiles.
                  </p>
                </div>
              </div>
            </div>

            {/* Flow visual box */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '16px',
              padding: '1.25rem',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              marginTop: 'auto'
            }}>
              <div style={{ fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>BIOMETRIC FLOW PIPELINE:</div>
              Webcam Feed → Alignment Validation → Pose/Quality Analysis → Active Challenge Check → Embedding Generation → pgvector Compare
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
