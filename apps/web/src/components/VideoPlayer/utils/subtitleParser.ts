import type { SubtitleCue, CueAlignment, FormattedLine, FormattedSpan, CueStyle } from '../types/subtitle.ts';

const DEFAULT_ALIGNMENT: CueAlignment = { vertical: 'bottom', horizontal: 'center' };

/** Convert ASS BGR color syntax `&H[AA]BBGGRR&` or `&HBBGGRR` to CSS hex `#RRGGBB` */
export function assColorToCss(assColor: string): string | undefined {
  const match = assColor.match(/&H(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})&?/);
  if (!match) return undefined;
  const [, b, g, r] = match;
  return `#${r}${g}${b}`.toUpperCase();
}

/** Convert ASS numpad alignment code (1-9) or legacy code to CueAlignment */
export function parseAssAlignment(code: number): CueAlignment {
  switch (code) {
    // Standard numpad alignments \an1 .. \an9
    case 1: return { vertical: 'bottom', horizontal: 'left' };
    case 2: return { vertical: 'bottom', horizontal: 'center' };
    case 3: return { vertical: 'bottom', horizontal: 'right' };
    case 4: return { vertical: 'middle', horizontal: 'left' };
    case 5: return { vertical: 'middle', horizontal: 'center' };
    case 6: return { vertical: 'middle', horizontal: 'right' };
    case 7: return { vertical: 'top', horizontal: 'left' };
    case 8: return { vertical: 'top', horizontal: 'center' };
    case 9: return { vertical: 'top', horizontal: 'right' };

    // Legacy SSA alignments \a1 .. \a11
    case 1: case 2: case 3: return { vertical: 'bottom', horizontal: code === 1 ? 'left' : code === 2 ? 'center' : 'right' };
    case 9: case 10: case 11: return { vertical: 'middle', horizontal: code === 9 ? 'left' : code === 10 ? 'center' : 'right' };
    case 5: case 6: case 7: return { vertical: 'top', horizontal: code === 5 ? 'left' : code === 6 ? 'center' : 'right' };

    default: return DEFAULT_ALIGNMENT;
  }
}

/** Parse timestamp like "00:01:23.456", "01:23,456", or "0:01:23.45" into seconds */
export function parseTimestamp(ts: string): number | null {
  const match = ts.trim().match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{1,4})/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const msStr = match[4];
  let ms = parseInt(msStr, 10);
  if (msStr.length === 1) ms *= 100;
  else if (msStr.length === 2) ms *= 10;
  else if (msStr.length > 3) ms = parseInt(msStr.slice(0, 3), 10);
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/** Parse WebVTT cue settings line (e.g. `line:10% align:center position:50%`) */
export function parseVttSettings(settingsStr: string): { alignment?: CueAlignment; position?: { x: number; y: number } } {
  let alignment: CueAlignment = { ...DEFAULT_ALIGNMENT };
  let position: { x: number; y: number } | undefined;

  const parts = settingsStr.split(/\s+/);
  for (const part of parts) {
    const [key, val] = part.split(':');
    if (!key || !val) continue;

    if (key === 'align') {
      if (val === 'start' || val === 'left') alignment.horizontal = 'left';
      else if (val === 'end' || val === 'right') alignment.horizontal = 'right';
      else if (val === 'center') alignment.horizontal = 'center';
    } else if (key === 'line') {
      const lineVal = parseFloat(val);
      if (!isNaN(lineVal)) {
        if (val.endsWith('%')) {
          alignment.vertical = lineVal < 33 ? 'top' : lineVal < 66 ? 'middle' : 'bottom';
          position = position || { x: 50, y: lineVal };
          position.y = lineVal;
        }
      }
    } else if (key === 'position') {
      const posVal = parseFloat(val);
      if (!isNaN(posVal)) {
        position = position || { x: posVal, y: 90 };
        position.x = posVal;
      }
    }
  }

  return { alignment, position };
}

/** Parse raw cue text containing ASS tags and/or HTML tags into lines of styled text spans */
export function parseCueText(rawText: string): { alignment: CueAlignment; position?: { x: number; y: number }; lines: FormattedLine[] } {
  let alignment: CueAlignment = { ...DEFAULT_ALIGNMENT };
  let position: { x: number; y: number } | undefined;

  // Extract ASS override blocks `{...}` first for cue-level alignment or positioning
  const assBlockRegex = /\{([^}]+)\}/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = assBlockRegex.exec(rawText)) !== null) {
    const blockContent = blockMatch[1];
    
    // Check for \an1 .. \an9 or \a1 .. \a11
    const anMatch = blockContent.match(/\\an(\d+)/);
    if (anMatch) {
      alignment = parseAssAlignment(parseInt(anMatch[1], 10));
    } else {
      const aMatch = blockContent.match(/\\a(\d+)/);
      if (aMatch) {
        alignment = parseAssAlignment(parseInt(aMatch[1], 10));
      }
    }

    // Check for \pos(x, y)
    const posMatch = blockContent.match(/\\pos\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (posMatch) {
      let x = parseFloat(posMatch[1]);
      let y = parseFloat(posMatch[2]);
      // Normalize coordinate resolution (assuming standard 1920x1080 if > 100)
      if (x > 100) x = (x / 1920) * 100;
      if (y > 100) y = (y / 1080) * 100;
      position = { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
    }
  }

  // Pre-process ASS line breaks and whitespace
  let processed = rawText
    .replace(/\\N/g, '\n')       // ASS Hard line break
    .replace(/\\h/g, '\u00A0')   // ASS Hard space (non-breaking space)
    .replace(/\\n/g, '\n');      // ASS Soft line break

  const rawLines = processed.split('\n');
  const lines: FormattedLine[] = [];

  for (const lineText of rawLines) {
    const spans: FormattedSpan[] = [];
    const currentStyle: CueStyle = {};

    // Tokenize line by ASS tags {...} or HTML tags <...>
    // Match tokens: ASS block `{...}`, HTML tag `<...>`, or plain text
    const tokenRegex = /(\{[^}]*\}|<[^>]+>|[^{<]+)/g;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = tokenRegex.exec(lineText)) !== null) {
      const token = tokenMatch[0];

      if (token.startsWith('{') && token.endsWith('}')) {
        // ASS Style Override Tag Block
        const tagContent = token.slice(1, -1);

        // Bold
        if (/\\b[1-9]\d{2}/.test(tagContent)) {
          currentStyle.bold = true;
        } else if (/\\b1(?!\d)/.test(tagContent)) {
          currentStyle.bold = true;
        } else if (/\\b0/.test(tagContent)) {
          currentStyle.bold = false;
        }

        // Italic
        if (/\\i1/.test(tagContent)) {
          currentStyle.italic = true;
        } else if (/\\i0/.test(tagContent)) {
          currentStyle.italic = false;
        }

        // Underline
        if (/\\u1/.test(tagContent)) {
          currentStyle.underline = true;
        } else if (/\\u0/.test(tagContent)) {
          currentStyle.underline = false;
        }

        // Strikeout
        if (/\\s1/.test(tagContent)) {
          currentStyle.strikethrough = true;
        } else if (/\\s0/.test(tagContent)) {
          currentStyle.strikethrough = false;
        }

        // Color \c&HBBGGRR& or \1c&HBBGGRR&
        const cMatch = tagContent.match(/\\(?:1c|c)(&H[0-9A-Fa-f]+&?)/);
        if (cMatch) {
          currentStyle.color = assColorToCss(cMatch[1]);
        }

        // Secondary / Outline Color \3c&HBBGGRR&
        const outlineMatch = tagContent.match(/\\3c(&H[0-9A-Fa-f]+&?)/);
        if (outlineMatch) {
          currentStyle.outlineColor = assColorToCss(outlineMatch[1]);
        }

        // Font Family \fnFontName
        const fnMatch = tagContent.match(/\\fn([^\\}]+)/);
        if (fnMatch) {
          currentStyle.fontFamily = fnMatch[1].trim();
        }

        // Font Size \fsSize
        const fsMatch = tagContent.match(/\\fs(\d+)/);
        if (fsMatch) {
          currentStyle.fontSize = `${fsMatch[1]}px`;
        }

        // (Drawing tags \p1...\p0 and effect tags \k, \fad, \t, etc. are cleanly swallowed here!)
      } else if (token.startsWith('<') && token.endsWith('>')) {
        // HTML / WebVTT Tag
        const tagLower = token.toLowerCase();

        if (tagLower === '<b>' || tagLower === '<strong>') currentStyle.bold = true;
        else if (tagLower === '</b>' || tagLower === '</strong>') currentStyle.bold = false;
        else if (tagLower === '<i>' || tagLower === '<em>') currentStyle.italic = true;
        else if (tagLower === '</i>' || tagLower === '</em>') currentStyle.italic = false;
        else if (tagLower === '<u>') currentStyle.underline = true;
        else if (tagLower === '</u>') currentStyle.underline = false;
        else if (tagLower === '<s>' || tagLower === '<strike>') currentStyle.strikethrough = true;
        else if (tagLower === '</s>' || tagLower === '</strike>') currentStyle.strikethrough = false;
        else if (tagLower.startsWith('<font')) {
          const colorAttr = token.match(/color=["']?([^"'\s>]+)["']?/i);
          if (colorAttr) currentStyle.color = colorAttr[1];
          const faceAttr = token.match(/face=["']?([^"'\s>]+)["']?/i);
          if (faceAttr) currentStyle.fontFamily = faceAttr[1];
        } else if (tagLower === '</font>') {
          delete currentStyle.color;
          delete currentStyle.fontFamily;
        } else if (tagLower.startsWith('<c.')) {
          // WebVTT class styling e.g. <c.yellow>
          const colorClassName = tagLower.slice(3, -1);
          if (colorClassName === 'yellow') currentStyle.color = '#FFFF00';
          else if (colorClassName === 'red') currentStyle.color = '#FF0000';
          else if (colorClassName === 'green') currentStyle.color = '#00FF00';
          else if (colorClassName === 'blue') currentStyle.color = '#0000FF';
          else if (colorClassName === 'cyan') currentStyle.color = '#00FFFF';
          else if (colorClassName === 'magenta') currentStyle.color = '#FF00FF';
        }
      } else {
        // Plain text content
        // Decode HTML entities
        const text = token
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        if (text) {
          spans.push({
            text,
            style: { ...currentStyle },
          });
        }
      }
    }

    if (spans.length > 0) {
      lines.push({ spans });
    }
  }

  return { alignment, position, lines };
}

/** Parses complete subtitle file string (VTT, SRT, ASS/SSA) into SubtitleCue[] */
export function parseSubtitleContent(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  // Check if content is ASS/SSA format
  if (normalized.includes('[Events]') && normalized.includes('Dialogue:')) {
    const lines = normalized.split('\n');
    let inEvents = false;
    let formatFields: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[Events]')) {
        inEvents = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inEvents = false;
        continue;
      }

      if (inEvents) {
        if (trimmed.startsWith('Format:')) {
          formatFields = trimmed.slice(7).split(',').map(f => f.trim().toLowerCase());
        } else if (trimmed.startsWith('Dialogue:')) {
          const body = trimmed.slice(9);
          // Split into comma parts matching Format fields
          const parts = body.split(',');
          if (parts.length >= 9) {
            const startIdx = formatFields.indexOf('start') !== -1 ? formatFields.indexOf('start') : 1;
            const endIdx = formatFields.indexOf('end') !== -1 ? formatFields.indexOf('end') : 2;
            const textIdx = formatFields.indexOf('text') !== -1 ? formatFields.indexOf('text') : 9;

            const startTime = parseTimestamp(parts[startIdx]);
            const endTime = parseTimestamp(parts[endIdx]);

            // Everything from textIdx onward is cue text (joined back if contains commas)
            const rawText = parts.slice(textIdx).join(',');

            if (startTime !== null && endTime !== null && rawText.trim()) {
              const { alignment, position, lines: parsedLines } = parseCueText(rawText);
              if (parsedLines.length > 0) {
                cues.push({
                  id: `ass-${cues.length}`,
                  startTime,
                  endTime,
                  alignment,
                  position,
                  lines: parsedLines,
                });
              }
            }
          }
        }
      }
    }
    return cues;
  }

  // Standard VTT or SRT block-based parsing
  const blocks = normalized.split(/\n\n+/);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block || block === 'WEBVTT') continue;

    const lines = block.split('\n');
    let timestampLineIdx = -1;

    for (let j = 0; j < lines.length; j++) {
      if (lines[j].includes('-->')) {
        timestampLineIdx = j;
        break;
      }
    }

    if (timestampLineIdx === -1) continue;

    const timeParts = lines[timestampLineIdx].split('-->');
    if (timeParts.length < 2) continue;

    const startTime = parseTimestamp(timeParts[0]);

    // Check for VTT settings after end timestamp
    const endPart = timeParts[1].trim();
    const endSpaceIdx = endPart.search(/\s/);
    const endTsStr = endSpaceIdx !== -1 ? endPart.slice(0, endSpaceIdx) : endPart;
    const settingsStr = endSpaceIdx !== -1 ? endPart.slice(endSpaceIdx).trim() : '';

    const endTime = parseTimestamp(endTsStr);
    if (startTime === null || endTime === null) continue;

    let vttParsedSettings = parseVttSettings(settingsStr);

    const rawCueText = lines.slice(timestampLineIdx + 1).join('\n');
    if (!rawCueText.trim()) continue;

    const { alignment, position, lines: parsedLines } = parseCueText(rawCueText);

    // Merge alignment/position if VTT settings had position/align
    const finalAlignment = alignment.vertical !== DEFAULT_ALIGNMENT.vertical || alignment.horizontal !== DEFAULT_ALIGNMENT.horizontal
      ? alignment
      : vttParsedSettings.alignment || DEFAULT_ALIGNMENT;

    const finalPosition = position || vttParsedSettings.position;

    if (parsedLines.length > 0) {
      cues.push({
        id: `cue-${cues.length}`,
        startTime,
        endTime,
        alignment: finalAlignment,
        position: finalPosition,
        lines: parsedLines,
      });
    }
  }

  return cues;
}
