import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { setToken } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (data.needsBootstrap) {
          navigate('/register');
        }
      })
      .catch(console.error);
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
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
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      
      <div className="w-full max-w-[360px]">
        <h1 className="text-20 font-semibold uppercase tracking-[0.08em] text-paper text-center mb-12">
          ROOMIES
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Input 
            label="USERNAME"
            name="username" 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className={error ? '*:border-paper' : ''}
          />
          
          <Input 
            label="PASSWORD" 
            name="password"
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
