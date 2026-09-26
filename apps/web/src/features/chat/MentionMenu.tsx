import React from 'react';
import { getUsernameColor } from './utils';

export interface MentionMember {
  userId: string;
  username: string;
}

interface MentionMenuProps {
  members: MentionMember[];
  selectedIndex: number;
  onSelectMember: (member: MentionMember) => void;
}

export const MentionMenu: React.FC<MentionMenuProps> = ({
  members,
  selectedIndex,
  onSelectMember,
}) => {
  if (members.length === 0) return null;

  return (
    <div className="w-full bg-ink border-t border-ash/20 max-h-48 overflow-y-auto shrink-0 z-20">
      <div className="px-3 py-1.5 text-11 font-bold uppercase tracking-wider text-fog/60 border-b border-ash/10">
        Mention Member
      </div>
      <div className="py-1">
        {members.map((member, index) => {
          const isSelected = index === selectedIndex;
          const userColor = getUsernameColor(member.username);

          return (
            <button
              key={member.userId || member.username}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectMember(member);
              }}
              className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors duration-150 ${
                isSelected ? 'bg-ash/20 text-paper' : 'hover:bg-ash/10 text-paper/80'
              }`}
            >
              <span className="font-bold uppercase text-12 tracking-wide" style={{ color: userColor }}>
                @{member.username}
              </span>
              <span className="text-11 text-fog/50">
                {isSelected ? '⏎ Select' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
