import React, { useState } from 'react';
import { UserPlus, LogIn, Mail, Lock, User } from 'lucide-react';

export default function AuthForm({ onSubmit, mode, setMode, loading }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (mode === 'signup' && !email.trim()) {
      setError('Email is required');
      return;
    }

    onSubmit({ username, email, password });
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
        <button
          onClick={() => { setMode('login'); setError(''); }}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: mode === 'login' ? '#3b82f6' : '#9ca3af',
            fontSize: '1.1rem',
            fontFamily: 'Outfit, sans-serif',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0',
            borderBottom: mode === 'login' ? '2px solid #3b82f6' : '2px solid transparent',
            transition: 'all 0.3s ease'
          }}
        >
          <LogIn size={18} />
          Login
        </button>
        <button
          onClick={() => { setMode('signup'); setError(''); }}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: mode === 'signup' ? '#10b981' : '#9ca3af',
            fontSize: '1.1rem',
            fontFamily: 'Outfit, sans-serif',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0',
            borderBottom: mode === 'signup' ? '2px solid #10b981' : '2px solid transparent',
            transition: 'all 0.3s ease'
          }}
        >
          <UserPlus size={18} />
          Enroll / Signup
        </button>
      </div>

      <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.5rem', textAlign: 'center' }}>
        {mode === 'signup' ? 'Create Secure Profile' : 'Biometric Access Verification'}
      </h2>

      {error && (
        <div className="alert alert-error" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={16} /> Username or Email
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        {mode === 'signup' && (
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={16} /> Email Address
            </label>
            <input
              type="email"
              className="form-input"
              placeholder="e.g. user@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        )}

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={16} /> Master Passphrase (Optional)
          </label>
          <input
            type="password"
            className="form-input"
            placeholder="master security password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          style={{
            background: mode === 'signup' 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
          disabled={loading}
        >
          {loading ? (
            <span className="animate-spin" style={{
              width: '18px',
              height: '18px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              display: 'inline-block'
            }}></span>
          ) : (
            <>
              {mode === 'signup' ? <UserPlus size={18} /> : <LogIn size={18} />}
              Initialize Biometric Capture
            </>
          )}
        </button>
      </form>
      
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
        Requires a webcam connection. Face templates will be converted to mathematical vectors and kept secure.
      </div>
    </div>
  );
}
