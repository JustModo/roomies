import React from 'react';
import type { SubtitleCue, CueAlignment, FormattedLine } from '../types/subtitle.ts';

interface SubtitleOverlayProps {
  activeCues: SubtitleCue[];
  fontScale?: number;
}

const getAlignmentKey = (alignment: CueAlignment): string => {
  return `${alignment.vertical}-${alignment.horizontal}`;
};

const RenderLine: React.FC<{ line: FormattedLine }> = ({ line }) => {
  return (
    <div className="inline-block leading-tight">
      {line.spans.map((span, idx) => {
        const textDecorations: string[] = [];
        if (span.style.underline) textDecorations.push('underline');
        if (span.style.strikethrough) textDecorations.push('line-through');

        const style: React.CSSProperties = {
          fontWeight: span.style.bold ? 700 : 500,
          fontStyle: span.style.italic ? 'italic' : 'normal',
          textDecoration: textDecorations.join(' ') || 'none',
          color: span.style.color || '#ffffff',
          fontFamily: span.style.fontFamily || "'Inter', sans-serif",
          fontSize: span.style.fontSize ? span.style.fontSize : undefined,
          textShadow: span.style.outlineColor
            ? `-1px -1px 0 ${span.style.outlineColor}, 1px -1px 0 ${span.style.outlineColor}, -1px 1px 0 ${span.style.outlineColor}, 1px 1px 0 ${span.style.outlineColor}, 0 2px 4px rgba(0,0,0,0.8)`
            : '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.6)',
        };

        return (
          <span key={idx} style={style}>
            {span.text}
          </span>
        );
      })}
    </div>
  );
};

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ activeCues, fontScale = 1 }) => {
  if (!activeCues || activeCues.length === 0) return null;

  const positionedCues: SubtitleCue[] = [];
  const gridCues: Record<string, SubtitleCue[]> = {};

  for (const cue of activeCues) {
    if (cue.position) {
      positionedCues.push(cue);
    } else {
      const key = getAlignmentKey(cue.alignment);
      if (!gridCues[key]) gridCues[key] = [];
      gridCues[key].push(cue);
    }
  }

  const baseFontSize = `${2 * fontScale}vw`;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden" style={{ fontSize: baseFontSize }}>
      {/* 1. Explicit Position Cues (\pos(x,y)) */}
      {positionedCues.map((cue) => (
        <div
          key={cue.id}
          style={{
            position: 'absolute',
            left: `${cue.position!.x}%`,
            top: `${cue.position!.y}%`,
            transform: 'translate(-50%, -50%)',
            textAlign: cue.alignment.horizontal,
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
          }}
        >
          {cue.lines.map((line, lineIdx) => (
            <div key={lineIdx}>
              <RenderLine line={line} />
            </div>
          ))}
        </div>
      ))}

      {/* 2. 9-Grid Region Cues (\an1 .. \an9) */}
      {Object.entries(gridCues).map(([key, cues]) => {
        const [vertical, horizontal] = key.split('-');

        const containerStyle: React.CSSProperties = {
          position: 'absolute',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        };

        // Vertical positioning
        if (vertical === 'top') {
          containerStyle.top = '5%';
          containerStyle.justifyContent = 'flex-start';
        } else if (vertical === 'middle') {
          containerStyle.top = '50%';
          containerStyle.transform = 'translateY(-50%)';
          containerStyle.justifyContent = 'center';
        } else {
          containerStyle.bottom = '5%';
          containerStyle.justifyContent = 'flex-end';
        }

        // Horizontal positioning
        if (horizontal === 'left') {
          containerStyle.left = '5%';
          containerStyle.alignItems = 'flex-start';
          containerStyle.textAlign = 'left';
        } else if (horizontal === 'right') {
          containerStyle.right = '5%';
          containerStyle.alignItems = 'flex-end';
          containerStyle.textAlign = 'right';
        } else {
          containerStyle.left = '5%';
          containerStyle.right = '5%';
          containerStyle.alignItems = 'center';
          containerStyle.textAlign = 'center';
        }

        return (
          <div key={key} style={containerStyle}>
            {cues.map((cue) => (
              <div key={cue.id} className="my-0.5">
                {cue.lines.map((line, lineIdx) => (
                  <div key={lineIdx}>
                    <RenderLine line={line} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
