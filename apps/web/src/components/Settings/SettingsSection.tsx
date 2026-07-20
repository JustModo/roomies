import React from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { RoomState } from '../../hooks/useRoomSync';
import { Bell, Volume2, VolumeX, BellOff, Radio } from 'lucide-react';

interface SettingsSectionProps {
  roomState?: RoomState | null;
  updateSettings?: (settings: { allowAsyncMode?: boolean }) => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ roomState, updateSettings }) => {
  const { user } = useAuth();
  const { 
    soundEnabled, setSoundEnabled, 
    browserNotificationsEnabled, setBrowserNotificationsEnabled 
  } = useChat();

  const allowAsyncMode = roomState?.settings?.allowAsyncMode ?? true;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-void">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        
        {/* Admin Room Settings */}
        {user?.role === 'root' && (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-12 font-semibold uppercase tracking-widest text-paper/80">
                Room Settings
              </h3>
            </div>
            
            <div className="flex flex-col gap-3">
              {/* Allow Async Mode Toggle */}
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center">
                    <Radio size={16} className={allowAsyncMode ? 'text-blue-400' : 'text-paper/40'} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-14 font-medium text-paper">Allow Async Mode</span>
                    <span className="text-12 text-paper/50">Allow members to detach into local async playback</span>
                  </div>
                </div>
                
                <button
                  onClick={() => updateSettings?.({ allowAsyncMode: !allowAsyncMode })}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                    allowAsyncMode ? 'bg-blue-400' : 'bg-ash/20'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out ${
                      allowAsyncMode ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col">
          <h3 className="text-12 font-semibold uppercase tracking-widest text-paper/80 mb-4">
            Notifications
          </h3>
          
          <div className="flex flex-col gap-3">
            
            {/* Notification Sounds Toggle */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center">
                  {soundEnabled ? <Volume2 size={16} className="text-blue-400" /> : <VolumeX size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Notification Sounds</span>
                  <span className="text-12 text-paper/50">Play a sound for new messages</span>
                </div>
              </div>
              
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  soundEnabled ? 'bg-blue-400' : 'bg-ash/20'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    soundEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Browser Notifications Toggle */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center">
                  {browserNotificationsEnabled ? <Bell size={16} className="text-blue-400" /> : <BellOff size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Browser Notifications</span>
                  <span className="text-12 text-paper/50">Show system alerts when in background</span>
                </div>
              </div>
              
              <button
                onClick={() => {
                  if (!browserNotificationsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
                    Notification.requestPermission();
                  }
                  setBrowserNotificationsEnabled(!browserNotificationsEnabled);
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  browserNotificationsEnabled ? 'bg-blue-400' : 'bg-ash/20'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    browserNotificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
