import { describe, it, expect } from 'vitest';
import {
  assColorToCss,
  parseTimestamp,
  parseVttSettings,
  parseCueText,
  parseSubtitleContent,
} from '@roomies/web/src/components/VideoPlayer/utils/subtitleParser';

describe('Web subtitle parser', () => {
  it('parses VTT, SRT and short ASS timestamps', () => {
    expect(parseTimestamp('00:01:23.456')).toBeCloseTo(83.456);
    expect(parseTimestamp('01:23,456')).toBeCloseTo(83.456);
    expect(parseTimestamp('0:01:23.45')).toBeCloseTo(83.45);
    expect(parseTimestamp('1:00:00.5')).toBeCloseTo(3600.5);
    expect(parseTimestamp('nonsense')).toBeNull();
  });

  it('converts ASS BGR colours to CSS hex', () => {
    expect(assColorToCss('&H0000FF&')).toBe('#FF0000');
    expect(assColorToCss('&H00FF0000')).toBe('#0000FF');
    expect(assColorToCss('red')).toBeUndefined();
  });

  it('reads VTT cue settings into alignment and position', () => {
    const { alignment, position } = parseVttSettings('line:10% align:start position:20%');
    expect(alignment).toEqual({ vertical: 'top', horizontal: 'left' });
    expect(position).toEqual({ x: 20, y: 10 });
  });

  it('turns ASS override tags and HTML tags into styled spans', () => {
    const { alignment, lines } = parseCueText('{\\an8\\b1}Bold <i>italic</i>\\NNext');

    expect(alignment).toEqual({ vertical: 'top', horizontal: 'center' });
    expect(lines).toHaveLength(2);
    expect(lines[0].spans).toEqual([
      { text: 'Bold ', style: { bold: true } },
      { text: 'italic', style: { bold: true, italic: true } },
    ]);
    expect(lines[1].spans[0].text).toBe('Next');
  });

  it('parses an SRT file with a BOM and CRLF line endings', () => {
    const cues = parseSubtitleContent('﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello &amp; bye\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond\r\n');

    expect(cues.map((c) => [c.startTime, c.endTime])).toEqual([[1, 2.5], [3, 4]]);
    expect(cues[0].lines[0].spans[0].text).toBe('Hello & bye');
  });

  it('parses a WebVTT file and applies cue settings', () => {
    const cues = parseSubtitleContent('WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:right\nRight side\n');

    expect(cues).toHaveLength(1);
    expect(cues[0].alignment).toEqual({ vertical: 'bottom', horizontal: 'right' });
  });

  it('parses ASS dialogue using the Format line and keeps commas in the text', () => {
    const ass = [
      '[Script Info]',
      'Title: x',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\pos(960,540)}Hello, world',
    ].join('\n');

    const [cue] = parseSubtitleContent(ass);
    expect(cue.startTime).toBe(1);
    expect(cue.endTime).toBe(3.5);
    expect(cue.position).toEqual({ x: 50, y: 50 });
    expect(cue.lines[0].spans[0].text).toBe('Hello, world');
  });
});
