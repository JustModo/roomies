import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranscodeStatus, usePartyState } from '../hooks/usePlayback';
// @ts-ignore
import Hls from 'hls.js';

export default function Party() {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { statusResponse, error: transcodeError } = useTranscodeStatus(partyId);
  const { partyState, error: stateError } = usePartyState(partyId);

  useEffect(() => {
    if (statusResponse.status === 'ready' && statusResponse.hlsUrl && videoRef.current) {
      const video = videoRef.current;
      const url = statusResponse.hlsUrl;

      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // You could auto-play here, but browsers usually block unmuted auto-play.
          console.log('HLS Manifest parsed');
        });
        
        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native support
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          console.log('Loaded native HLS');
        });
      }
    }
  }, [statusResponse]);

  if (transcodeError || stateError) {
    return (
      <div className="container">
        <div className="card" style={{ borderColor: 'var(--danger-color)' }}>
          <h2>Error loading party</h2>
          <p>{transcodeError || stateError}</p>
          <button onClick={() => navigate('/')} style={{ marginTop: 'var(--spacing-md)' }}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
        <h2>Watch Party: {partyId}</h2>
        <button onClick={() => navigate('/')} style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
          Leave Party
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {statusResponse.status === 'pending' || statusResponse.status === 'processing' ? (
          <div style={{ height: '600px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <span className="loader" style={{ marginBottom: 'var(--spacing-md)' }}></span>
            <p>Preparing media stream...</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Status: {statusResponse.status}</p>
          </div>
        ) : statusResponse.status === 'failed' ? (
          <div style={{ height: '600px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <p style={{ color: 'var(--danger-color)' }}>Transcoding failed.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', backgroundColor: '#000' }}>
            <video
              ref={videoRef}
              controls
              style={{ width: '100%', height: 'auto', maxHeight: '75vh', display: 'block' }}
            />
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--spacing-md)' }}>
        <h3>Party Information</h3>
        {partyState ? (
          <pre style={{ backgroundColor: 'var(--bg-primary)', padding: 'var(--spacing-sm)', borderRadius: '4px', overflowX: 'auto' }}>
            {JSON.stringify(partyState, null, 2)}
          </pre>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Loading state...</p>
        )}
      </div>
    </div>
  );
}
