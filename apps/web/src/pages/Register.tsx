import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check bootstrap status on load
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (data.hasRoot) {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {
        // If API fails, we'll just allow rendering for now (mocking)
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      
      if (!res.ok) {
        throw new Error('Registration failed');
      }
      
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
      }
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError('Failed to create account.');
    }
  };

  if (checking) return <div className="min-h-screen bg-void" />;

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      
      <div className="w-full max-w-[360px]">
        {success ? (
          <div className="text-center">
            <p className="text-16 text-paper mb-4">Account created successfully.</p>
            <p className="text-14 text-fog">Logging you in...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-12 flex flex-col gap-2">
              <h1 className="text-20 font-semibold uppercase tracking-[0.08em] text-paper">
                CREATE ROOT ACCOUNT
              </h1>
              <p className="text-14 text-fog">
                This appears once. It will not show again after this account is created.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input 
                label="USERNAME" 
                name="username"
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              
              <Input 
                label="PASSWORD" 
                name="password"
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />

              <Input 
                label="CONFIRM PASSWORD" 
                name="confirm-password"
                type="password" 
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              
              <div className="pt-4 flex flex-col gap-4">
                <Button type="submit">CREATE ACCOUNT</Button>
                {error && (
                  <p className="text-14 text-paper text-center">{error}</p>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
