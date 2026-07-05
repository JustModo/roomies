import { useEffect } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../api/client';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { library, isLoading, error, isScanning, scanLibrary } = useLibrary();
  const navigate = useNavigate();

  // Check if there is an active party and prompt to join if so
  useEffect(() => {
    const checkActiveParty = async () => {
      try {
        const data = await fetchApi('/playback/party/active');
        if (data.partyId) {
          // If there is an active party, maybe we should offer to join it or just redirect?
          // Let's just stay on the dashboard for now and let the user click a "Join Active Party" button.
        }
      } catch (err) {
        // Ignore error
      }
    };
    checkActiveParty();
  }, []);

  const handleStartParty = async (mediaFileId: string) => {
    try {
      const data = await fetchApi('/playback/start', {
        method: 'POST',
        body: { mediaFileId }
      });
      navigate(`/party/${data.partyId}`);
    } catch (err: any) {
      alert(`Failed to start party: ${err.message}`);
    }
  };

  const handleJoinActive = async () => {
    try {
      const data = await fetchApi('/playback/party/active');
      if (data.partyId) {
        navigate(`/party/${data.partyId}`);
      } else {
        alert('No active party right now.');
      }
    } catch (err: any) {
      alert(`Failed to check party: ${err.message}`);
    }
  };

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
        <div>
          <h1>Welcome, {user?.username}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Role: {user?.role}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button onClick={handleJoinActive} style={{ backgroundColor: 'var(--accent-hover)' }}>
            Join Active Party
          </button>
          <button onClick={logout} style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
            Logout
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
          <h2>Media Library</h2>
          <button onClick={scanLibrary} disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Scan Directory'}
          </button>
        </div>
        
        {error && (
          <div style={{ backgroundColor: 'var(--danger-color)', padding: '10px', borderRadius: '4px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
            <span className="loader"></span>
          </div>
        ) : library.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)', color: 'var(--text-secondary)' }}>
            No media files found. Put some MP4/MKV files in your media directory and click Scan.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--spacing-md)' }}>
            {library.map((file) => (
              <div key={file.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: 'var(--spacing-sm)', wordBreak: 'break-all' }}>
                  {file.title || file.path.split('/').pop()}
                </h3>
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {file.duration > 0 ? 'Ready' : 'Pending'}
                  </span>
                  <button onClick={() => handleStartParty(file.id)} style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
                    Watch
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
