import { describe, it, expect } from 'vitest';
import { parseAssDialogueTag } from '@roomies/library';

describe('Custom Subtitle Tag Engine & ASS Parser', () => {
  it('parses ASS numpad alignment tags \\an1 through \\an9 correctly', () => {
    for (let i = 1; i <= 9; i++) {
      const parsed = parseAssDialogueTag(`{\\an${i}}Test Dialogue`);
      expect(parsed.alignment).toBe(i);
    }
  });

  it('converts ASS BGR hex color tags to standard CSS RGB hex string', () => {
    // ASS BGR: &HFF0000& -> Blue in RGB (#0000FF)
    const parsedBlue = parseAssDialogueTag('{\\c&HFF0000&}Blue Text');
    expect(parsedBlue.primaryColor).toBe('#0000FF');

    // ASS BGR: &H0000FF& -> Red in RGB (#FF0000)
    const parsedRed = parseAssDialogueTag('{\\1c&H0000FF&}Red Text');
    expect(parsedRed.primaryColor).toBe('#FF0000');
  });

  it('parses inline bold and italic tags', () => {
    const parsed = parseAssDialogueTag('{\\b1\\i1}Styled Text');
    expect(parsed.isBold).toBe(true);
    expect(parsed.isItalic).toBe(true);
  });

  it('extracts absolute positioning coordinates from \\pos(x,y) tag', () => {
    const parsed = parseAssDialogueTag('{\\pos(192.5, 540.0)}Positioned Subtitle');
    expect(parsed.position).toBeDefined();
    expect(parsed.position?.x).toBe(192.5);
    expect(parsed.position?.y).toBe(540.0);
  });

  it('strips all enclosed ASS override blocks to leave clean subtitle text', () => {
    const parsed = parseAssDialogueTag('{\\an8\\c&H00FFFF&\\b1}Top Yellow Text');
    expect(parsed.cleanText).toBe('Top Yellow Text');
  });

  it('converts ASS line break \\N to newline character', () => {
    const parsed = parseAssDialogueTag('Line 1\\NLine 2');
    expect(parsed.cleanText).toBe('Line 1\nLine 2');
  });

  it('falls back to default bottom-center alignment for lines without alignment tags', () => {
    const parsed = parseAssDialogueTag('Plain Subtitle Line');
    expect(parsed.alignment).toBe(2);
  });
});
