import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchApi, ApiError } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let data;
      if (isSetupMode) {
        data = await fetchApi('/auth/setup', {
          method: 'POST',
          body: { username, password, inviteCode },
        });
      } else {
        data = await fetchApi('/auth/login', {
          method: 'POST',
          body: { username, password },
        });
      }
      setToken(data.token);
      navigate('/');
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: 'var(--spacing-md)' }}>
          {isSetupMode ? 'Server Setup' : 'Login'}
        </h2>
        
        {error && (
          <div style={{ backgroundColor: 'var(--danger-color)', padding: '10px', borderRadius: '4px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px' }}>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>

          {isSetupMode && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Invite Code</label>
              <input 
                type="text" 
                value={inviteCode} 
                onChange={e => setInviteCode(e.target.value)} 
                required 
              />
            </div>
          )}

          <button type="submit" disabled={isLoading} style={{ width: '100%', marginBottom: '16px' }}>
            {isLoading ? <span className="loader" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span> : (isSetupMode ? 'Setup Root Account' : 'Login')}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {isSetupMode ? "Already have an account? " : "First time setting up? "}
          <button 
            type="button"
            onClick={() => setIsSetupMode(!isSetupMode)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', padding: 0, fontSize: '0.9rem', textDecoration: 'underline' }}
          >
            {isSetupMode ? 'Login instead' : 'Click here'}
          </button>
        </div>
      </div>
    </div>
  );
}
