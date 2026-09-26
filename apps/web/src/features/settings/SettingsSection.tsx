import React from 'react';
import { Switch } from '../../ui/Switch';
import { useAuth } from '../auth/AuthContext';
import { useRoomConnection, useRoomSelector } from '../room/RoomProvider';
import { requestNotificationPermission } from '../chat/notify';
import { Bell, Volume2, VolumeX, BellOff, Radio, Smile } from 'lucide-react';
import { EmojiSlot } from './EmojiSlot';
import { usePrefs } from './PrefsContext';

export const SettingsSection: React.FC = () => {
  const { user } = useAuth();
  const { updateSettings } = useRoomConnection().actions;
  const allowAsyncMode = useRoomSelector((s) => s.room?.settings.allowAsyncMode ?? true);
  const {
    soundEnabled, setSoundEnabled,
    browserNotificationsEnabled, setBrowserNotificationsEnabled,
    emojiMuted, setEmojiMuted,
    emojiPicker, setEmojiPicker
  } = usePrefs();

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
                  <div className="w-8 h-8 bg-ash/20 flex items-center justify-center">
                    <Radio size={16} className={allowAsyncMode ? 'text-accent' : 'text-paper/40'} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-14 font-medium text-paper">Allow Async Mode</span>
                    <span className="text-12 text-paper/50">Allow members to detach into local async playback</span>
                  </div>
                </div>
                
                <Switch checked={allowAsyncMode} onChange={(enabled) => updateSettings({ allowAsyncMode: enabled })} label="Allow Async Mode" />
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
                <div className="w-8 h-8 bg-ash/20 flex items-center justify-center">
                  {soundEnabled ? <Volume2 size={16} className="text-accent" /> : <VolumeX size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Notification Sounds</span>
                  <span className="text-12 text-paper/50">Play a sound for new messages</span>
                </div>
              </div>
              
              <Switch checked={soundEnabled} onChange={setSoundEnabled} label="Notification Sounds" />
            </div>

            {/* Browser Notifications Toggle */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-ash/20 flex items-center justify-center">
                  {browserNotificationsEnabled ? <Bell size={16} className="text-accent" /> : <BellOff size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Browser Notifications</span>
                  <span className="text-12 text-paper/50">Show system alerts when in background</span>
                </div>
              </div>

              <Switch
                checked={browserNotificationsEnabled}
                onChange={(enabled) => {
                  if (enabled) requestNotificationPermission();
                  setBrowserNotificationsEnabled(enabled);
                }}
                label="Browser Notifications"
              />
            </div>

            {/* Mute Emoji Reactions Toggle */}
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-ash/20 flex items-center justify-center">
                  {emojiMuted ? <Smile size={16} className="text-accent" /> : <Smile size={16} className="text-paper/40" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-paper">Mute emoji reactions</span>
                  <span className="text-12 text-paper/50">Hide floating emojis and reaction badges</span>
                </div>
              </div>

              <Switch checked={emojiMuted} onChange={setEmojiMuted} label="Mute emoji reactions" />
            </div>

            {/* Emoji Picker Customization */}
            <div className="pt-4 border-t border-ash/10">
              <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <div className="w-8 h-8 bg-ash/20 flex items-center justify-center shrink-0">
                    <Smile size={16} className="text-accent" />
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
