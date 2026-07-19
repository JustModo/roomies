export class FrameBuffer {
    private buf: Float32Array;
    private pos = 0;
    private readonly frameSize: number;
    private readonly onFrame: (frame: Float32Array) => void;

    constructor(frameSize: number, onFrame: (frame: Float32Array) => void) {
        this.frameSize = frameSize;
        this.buf = new Float32Array(frameSize);
        this.onFrame = onFrame;
    }

    push(samples: Float32Array): void {
        let offset = 0;
        while (offset < samples.length) {
            const space = this.frameSize - this.pos;
            const toCopy = Math.min(space, samples.length - offset);
            this.buf.set(samples.subarray(offset, offset + toCopy), this.pos);
            this.pos += toCopy;
            offset += toCopy;

            if (this.pos === this.frameSize) {
                this.onFrame(this.buf);
                this.buf = new Float32Array(this.frameSize);
                this.pos = 0;
            }
        }
    }
}
