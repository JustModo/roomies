import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { HairlinePulse } from '../components/ui/HairlinePulse';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    setLoading(true);
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (data.needsBootstrap) {
          navigate('/register');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        throw new Error('Incorrect username or password.');
      }
      
      const data = await res.json();
      setToken(data.token);
      navigate('/');
    } catch (err) {
      setError('Incorrect username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <HairlinePulse isLoading={loading} />
      
      <div className="w-full max-w-[360px]">
        <h1 className="text-20 font-semibold uppercase tracking-[0.08em] text-paper text-center mb-12">
          THE ROOM
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <Input 
            label="USERNAME" 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className={error ? '*:border-paper' : ''}
          />
          
          <Input 
            label="PASSWORD" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={error ? '*:border-paper' : ''}
          />
          
          <div className="pt-4 flex flex-col gap-4">
            <Button type="submit">ENTER</Button>
            {error && (
              <p className="text-14 text-paper text-center">{error}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
