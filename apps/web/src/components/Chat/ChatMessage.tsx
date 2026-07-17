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
      <div className="flex items-center justify-center py-1.5 my-0.5 text-[8px] sm:text-[9px] font-medium tracking-wide text-paper/40 uppercase border-b border-ash/5 last:border-b-0">
        <SystemIcon type={msg.eventType} />
        {msg.username ? (
          <span>
            <span style={{ color: getUsernameColor(msg.username) }} className="font-bold opacity-70">{msg.username}</span>
            <span className="ml-1">{msg.body}</span>
          </span>
        ) : (
          <span>{msg.body}</span>
        )}
      </div>
    );
  }

  let paddingClass = '';
  if (!isGrouped && !isNextGrouped) paddingClass = 'pt-2 pb-1';
  else if (!isGrouped && isNextGrouped) paddingClass = 'pt-2 pb-0.5';
  else if (isGrouped && isNextGrouped) paddingClass = 'pt-0.5 pb-0.5';
  else if (isGrouped && !isNextGrouped) paddingClass = 'pt-0.5 pb-1';

  return (
    <div
      className={`flex flex-col gap-1 ${paddingClass} ${!isNextGrouped ? 'border-b border-ash/5 last:border-b-0' : ''} wrap-break-word`}
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
