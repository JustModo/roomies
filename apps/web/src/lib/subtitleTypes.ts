export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type HorizontalAlign = 'left' | 'center' | 'right';

export interface CueAlignment {
  vertical: VerticalAlign;
  horizontal: HorizontalAlign;
}

export interface CueStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;        // Hex "#RRGGBB" or "rgba(...)"
  outlineColor?: string; // Secondary or border color
  fontFamily?: string;
  fontSize?: string;
}

export interface FormattedSpan {
  text: string;
  style: CueStyle;
}

export interface FormattedLine {
  spans: FormattedSpan[];
}

export interface SubtitleCue {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  alignment: CueAlignment;
  position?: {
    x: number; // percentage offset (0-100)
    y: number; // percentage offset (0-100)
  };
  lines: FormattedLine[];
}
