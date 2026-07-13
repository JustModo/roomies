import React from 'react';
import { UserPlus, UserMinus, Play, Pause, FastForward, Gauge } from 'lucide-react';
import { Message } from '../../contexts/ChatContext';

interface SystemIconProps {
  type?: Message['eventType'];
}

/** Icon that represents a system event type in chat */
export const SystemIcon: React.FC<SystemIconProps> = ({ type }) => {
  const props = { size: 12, className: 'mr-1.5 opacity-70 inline-block align-middle' };
  switch (type) {
    case 'join':  return <UserPlus {...props} />;
    case 'leave': return <UserMinus {...props} />;
    case 'play':  return <Play {...props} />;
    case 'pause': return <Pause {...props} />;
    case 'seek':  return <FastForward {...props} />;
    case 'rate':  return <Gauge {...props} />;
    default:      return null;
  }
};
