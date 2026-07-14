import React from 'react';

interface SubtitleOverlayProps {
  activeCueHtml: string;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ activeCueHtml }) => {
  if (!activeCueHtml) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '5%',
        left: '5%',
        right: '5%',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10,
        fontSize: '2vw',
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
        lineHeight: 1.2,
        color: '#ffffff',
        whiteSpace: 'pre-wrap',
        textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.5)',
      }}
      dangerouslySetInnerHTML={{ __html: activeCueHtml }}
    />
  );
};
