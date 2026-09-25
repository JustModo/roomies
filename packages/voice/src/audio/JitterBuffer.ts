export interface JitterBufferOptions {
    targetDepthFrames: number;
    maxDepthFrames: number;
    maxConcealFrames: number;
}

export type PlayoutAction =
    | { kind: 'play'; seq: number; packet: Uint8Array }
    | { kind: 'fec'; seq: number; packet: Uint8Array }
    | { kind: 'plc'; seq: number }
    | { kind: 'idle' };

export const seqDiff = (a: number, b: number): number => ((a - b + 0x8000) & 0xffff) - 0x8000;

const nextSeqOf = (seq: number): number => (seq + 1) & 0xffff;

export class JitterBuffer {
    private readonly options: JitterBufferOptions;
    private packets = new Map<number, Uint8Array>();
    private lowestSeq: number | null = null;
    private highestSeq: number | null = null;
    private nextSeq: number | null = null;
    private concealedFrames = 0;
    private waitedFrames = 0;

    constructor(options: JitterBufferOptions) {
        this.options = options;
    }

    public get depth(): number {
        const start = this.nextSeq ?? this.lowestSeq;
        if (start === null || this.highestSeq === null || this.packets.size === 0) return 0;
        return seqDiff(this.highestSeq, start) + 1;
    }

    public get isPlaying(): boolean {
        return this.nextSeq !== null;
    }

    public push(seq: number, packet: Uint8Array): boolean {
        if (this.nextSeq !== null && seqDiff(seq, this.nextSeq) < 0) return false;
        if (this.packets.has(seq)) return false;

        this.packets.set(seq, packet);
        if (this.highestSeq === null || seqDiff(seq, this.highestSeq) > 0) this.highestSeq = seq;
        if (this.lowestSeq === null || seqDiff(seq, this.lowestSeq) < 0) this.lowestSeq = seq;

        if (this.depth > this.options.maxDepthFrames) this.trimToTarget();
        return true;
    }

    public pop(): PlayoutAction {
        if (this.nextSeq === null) {
            if (this.packets.size === 0) return { kind: 'idle' };
            this.waitedFrames++;
            if (this.depth < this.options.targetDepthFrames && this.waitedFrames < this.options.targetDepthFrames) {
                return { kind: 'idle' };
            }
            this.nextSeq = this.lowestSeq;
            this.waitedFrames = 0;
        }

        const seq = this.nextSeq!;
        this.nextSeq = nextSeqOf(seq);

        const packet = this.packets.get(seq);
        if (packet) {
            this.packets.delete(seq);
            this.concealedFrames = 0;
            return { kind: 'play', seq, packet };
        }

        if (this.packets.size === 0) {
            if (++this.concealedFrames > this.options.maxConcealFrames) {
                this.reset();
                return { kind: 'idle' };
            }
            return { kind: 'plc', seq };
        }

        const next = this.packets.get(this.nextSeq);
        return next ? { kind: 'fec', seq, packet: next } : { kind: 'plc', seq };
    }

    public reset(): void {
        this.packets.clear();
        this.lowestSeq = null;
        this.highestSeq = null;
        this.nextSeq = null;
        this.concealedFrames = 0;
        this.waitedFrames = 0;
    }

    private trimToTarget(): void {
        const cutoff = (this.highestSeq! - this.options.targetDepthFrames + 1) & 0xffff;
        for (const seq of this.packets.keys()) {
            if (seqDiff(seq, cutoff) < 0) this.packets.delete(seq);
        }
        let start = cutoff;
        while (!this.packets.has(start)) start = nextSeqOf(start);
        this.lowestSeq = start;
        if (this.nextSeq !== null) this.nextSeq = start;
    }
}
