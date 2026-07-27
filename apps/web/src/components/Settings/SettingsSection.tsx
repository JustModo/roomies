import React from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';
import { RoomState } from '@roomies/contracts';
import { Bell, Volume2, VolumeX, BellOff, Radio, Smile } from 'lucide-react';
import { EmojiSlot } from './EmojiSlot';

interface SettingsSectionProps {
  roomState?: RoomState | null;
  updateSettings?: (settings: { allowAsyncMode?: boolean }) => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ roomState, updateSettings }) => {
  const { user } = useAuth();
  const {
    soundEnabled, setSoundEnabled,
    browserNotificationsEnabled, setBrowserNotificationsEnabled,
    emojiMuted, setEmojiMuted,
    emojiPicker, setEmojiPicker
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

            {/* Mute Emoji Reactions Toggle */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center">
                  {emojiMuted ? <Smile size={16} className="text-blue-400" /> : <Smile size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Mute emoji reactions</span>
                  <span className="text-12 text-paper/50">Hide floating emojis and reaction badges</span>
                </div>
              </div>

              <button
                onClick={() => setEmojiMuted(!emojiMuted)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  emojiMuted ? 'bg-blue-400' : 'bg-ash/20'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    emojiMuted ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Emoji Picker Customization */}
            <div className="pt-4 border-t border-ash/10">
              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <div className="w-8 h-8 rounded-full bg-ash/20 flex items-center justify-center shrink-0">
                    <Smile size={16} className="text-blue-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-14 font-medium text-paper truncate">Emoji Picker</span>
                    <span className="text-12 text-paper/50 truncate">Customize your 6 reaction emojis</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0 lg:flex-nowrap">
                  {emojiPicker.map((emoji, index) => (
                    <EmojiSlot
                      key={index}
                      index={index}
                      emoji={emoji}
                      onChange={(newEmoji) => {
                        const next = [...emojiPicker];
                        next[index] = newEmoji;
                        setEmojiPicker(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
