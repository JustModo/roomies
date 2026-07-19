export class AudioPreprocessor {
    private previousInputSample = 0;
    private previousOutputSample = 0;
    private readonly dcBlockerR: number;

    constructor(dcBlockerR: number) {
        this.dcBlockerR = dcBlockerR;
    }

    reset(): void {
        this.previousInputSample = 0;
        this.previousOutputSample = 0;
    }

    process(frame: Float32Array): Float32Array {
        const filtered = new Float32Array(frame.length);

        for (let i = 0; i < frame.length; i++) {
            const sample = Math.max(-1, Math.min(1, frame[i]));
            const output = sample - this.previousInputSample + this.dcBlockerR * this.previousOutputSample;

            this.previousInputSample = sample;
            this.previousOutputSample = output;
            filtered[i] = Math.max(-1, Math.min(1, output));
        }

        return filtered;
    }
}
