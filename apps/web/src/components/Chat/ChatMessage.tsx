import React from 'react';
import { Message } from '../../contexts/ChatContext';
import { SystemIcon } from './SystemIcon';
import { getUsernameColor } from './utils';

interface ChatMessageProps {
  msg: Message;
  isGrouped: boolean;   // same sender as message above
  isNextGrouped: boolean; // same sender as message below
}

/** A single chat message row — supports chat and system message variants */
export const ChatMessage: React.FC<ChatMessageProps> = ({ msg, isGrouped, isNextGrouped }) => {
  if (msg.isSystem) {
    return (
      <div className="flex items-center justify-center py-2 my-1 text-[10px] font-medium tracking-wide text-paper/60 uppercase border-b border-ash/5 last:border-b-0">
        <SystemIcon type={msg.eventType} />
        {msg.body}
      </div>
    );
  }

  let paddingClass = '';
  if (!isGrouped && !isNextGrouped) paddingClass = 'pt-2 pb-3';
  else if (!isGrouped && isNextGrouped) paddingClass = 'pt-2 pb-0.5';
  else if (isGrouped && isNextGrouped) paddingClass = 'pt-0.5 pb-0.5';
  else if (isGrouped && !isNextGrouped) paddingClass = 'pt-0.5 pb-3';

  return (
    <div
      className={`flex flex-col gap-1 ${paddingClass} ${!isNextGrouped ? 'border-b border-ash/5 last:border-b-0' : ''} break-words`}
    >
      {!isGrouped && (
        <span
          className="font-extrabold tracking-wider text-[10px] leading-none uppercase mt-1"
          style={{ color: getUsernameColor(msg.username || 'unknown') }}
        >
          {msg.username}
        </span>
      )}
      <span className="text-paper/60 text-[14px] leading-snug">{msg.body}</span>
    </div>
  );
};
