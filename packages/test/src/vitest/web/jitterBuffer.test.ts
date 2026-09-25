import { describe, it, expect } from 'vitest';
import { JitterBuffer, seqDiff } from '@roomies/voice/src/audio/JitterBuffer';

const packet = (seq: number) => new Uint8Array([seq & 0xff, seq >> 8]);

const buffer = () => new JitterBuffer({ targetDepthFrames: 3, maxDepthFrames: 6, maxConcealFrames: 2 });

const fill = (jb: JitterBuffer, ...seqs: number[]) => seqs.map((seq) => jb.push(seq, packet(seq)));

describe('JitterBuffer', () => {
  it('computes signed sequence distance across the 16-bit wrap', () => {
    expect(seqDiff(5, 3)).toBe(2);
    expect(seqDiff(3, 5)).toBe(-2);
    expect(seqDiff(0, 65535)).toBe(1);
    expect(seqDiff(65535, 0)).toBe(-1);
    expect(seqDiff(10, 65530)).toBe(16);
  });

  it('stays idle until the target depth is buffered', () => {
    const jb = buffer();
    expect(jb.pop()).toEqual({ kind: 'idle' });

    fill(jb, 10);
    expect(jb.pop()).toEqual({ kind: 'idle' });
    expect(jb.isPlaying).toBe(false);

    fill(jb, 11, 12);
    expect(jb.depth).toBe(3);
    expect(jb.pop()).toEqual({ kind: 'play', seq: 10, packet: packet(10) });
    expect(jb.isPlaying).toBe(true);
  });

  it('starts playing a shallow buffer after waiting target-depth frames', () => {
    const jb = buffer();
    fill(jb, 10);

    expect(jb.pop().kind).toBe('idle');
    expect(jb.pop().kind).toBe('idle');
    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 10 });
  });

  it('plays in order across the 65535 -> 0 wrap', () => {
    const jb = buffer();
    fill(jb, 0, 65535, 65534);

    expect([jb.pop(), jb.pop(), jb.pop()].map((a) => (a.kind === 'play' ? a.seq : a.kind))).toEqual([65534, 65535, 0]);
  });

  it('drops late and duplicate packets', () => {
    const jb = buffer();
    expect(fill(jb, 5, 6, 7)).toEqual([true, true, true]);
    expect(jb.push(7, packet(7))).toBe(false);

    jb.pop();
    expect(jb.push(5, packet(5))).toBe(false);
    expect(jb.push(4, packet(4))).toBe(false);
    expect(jb.push(8, packet(8))).toBe(true);
  });

  it("decodes a lost frame from the next packet's FEC when that packet is buffered", () => {
    const jb = buffer();
    fill(jb, 1, 3, 4);

    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 1 });
    expect(jb.pop()).toEqual({ kind: 'fec', seq: 2, packet: packet(3) });
    expect(jb.pop()).toEqual({ kind: 'play', seq: 3, packet: packet(3) });
  });

  it('conceals a lost frame with PLC when the next packet is missing too', () => {
    const jb = buffer();
    fill(jb, 1, 4, 5);

    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 1 });
    expect(jb.pop()).toEqual({ kind: 'plc', seq: 2 });
    expect(jb.pop()).toEqual({ kind: 'fec', seq: 3, packet: packet(4) });
    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 4 });
  });

  it('resets to idle after maxConcealFrames of an empty buffer', () => {
    const jb = buffer();
    fill(jb, 1, 2, 3);
    jb.pop();
    jb.pop();
    jb.pop();

    expect(jb.pop()).toEqual({ kind: 'plc', seq: 4 });
    expect(jb.pop()).toEqual({ kind: 'plc', seq: 5 });
    expect(jb.pop()).toEqual({ kind: 'idle' });
    expect(jb.isPlaying).toBe(false);
    expect(jb.depth).toBe(0);
    expect(jb.push(2, packet(2))).toBe(true);
  });

  it('trims back to the target depth once the buffer exceeds maxDepthFrames', () => {
    const jb = buffer();
    fill(jb, 1, 2, 3, 4, 5, 6);
    expect(jb.depth).toBe(6);

    fill(jb, 7);
    expect(jb.depth).toBe(3);
    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 5 });
  });

  it('skips playout forward when trimming while already playing', () => {
    const jb = buffer();
    fill(jb, 1, 2, 3);
    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 1 });

    fill(jb, 4, 5, 6, 7, 8);
    expect(jb.depth).toBe(3);
    expect(jb.pop()).toMatchObject({ kind: 'play', seq: 6 });
  });

  it('clears everything on reset', () => {
    const jb = buffer();
    fill(jb, 1, 2, 3);
    jb.pop();
    jb.reset();

    expect(jb.isPlaying).toBe(false);
    expect(jb.depth).toBe(0);
    expect(jb.pop()).toEqual({ kind: 'idle' });
  });
});
