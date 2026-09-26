import React from 'react';
import { Message, useChat } from './ChatContext';
import { SystemIcon } from './SystemIcon';
import { getUsernameColor } from './utils';
import { parseMentions, isUserPinged } from './mentionUtils';

interface ChatMessageProps {
  msg: Message;
  isGrouped: boolean;   // same sender as message above
  isNextGrouped: boolean; // same sender as message below
}

/** A single chat message row — supports chat and system message variants */
export const ChatMessage: React.FC<ChatMessageProps> = ({ msg, isGrouped, isNextGrouped }) => {
  const { knownUsernames = [], currentUsername } = useChat();

  if (msg.isSystem) {
    return (
      <div className="flex items-center justify-center pt-2 pb-1 text-11 sm:text-11 font-medium tracking-wide text-paper/40 uppercase border-b border-ash/5 last:border-b-0">
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

  const isPingedForMe = !msg.isMine && isUserPinged(msg.body, currentUsername);
  const tokens = parseMentions(msg.body, knownUsernames);

  return (
    <div
      className={`flex flex-col gap-1 ${paddingClass} ${!isNextGrouped ? 'border-b border-ash/5 last:border-b-0' : ''} wrap-break-word transition-colors duration-150 ${
        isPingedForMe ? 'bg-fog/5 -mx-4 px-4' : ''
      }`}
    >
      {!isGrouped && (
        <span
          className="font-bold tracking-wider text-11 leading-none uppercase mt-1"
          style={{ color: getUsernameColor(msg.username || 'unknown') }}
        >
          {msg.username}
        </span>
      )}
      <span className="text-paper/60 text-14 leading-snug whitespace-pre-wrap">
        {tokens.map((token, idx) => {
          if (token.type === 'text') {
            return <React.Fragment key={idx}>{token.content}</React.Fragment>;
          }
          const userColor = getUsernameColor(token.username);
          return (
            <span
              key={idx}
              className="font-bold uppercase tracking-wider text-11 py-0.5 inline opacity-70"
              style={{
                color: userColor,
                backgroundColor: `${userColor}15`,
              }}
            >
              @{token.username}
            </span>
          );
        })}
      </span>
    </div>
  );
};

