export interface VoiceActivityDetectorOptions {
    rmsThreshold: number;
    startFrames: number;
    hangoverFrames: number;
    warmupFrames: number;
}

export class VoiceActivityDetector {
    private warmupFramesRemaining: number;
    private speechFrames = 0;
    private hangoverFramesRemaining = 0;
    private readonly options: VoiceActivityDetectorOptions;

    constructor(options: VoiceActivityDetectorOptions) {
        this.options = options;
        this.warmupFramesRemaining = options.warmupFrames;
    }

    reset(): void {
        this.warmupFramesRemaining = this.options.warmupFrames;
        this.speechFrames = 0;
        this.hangoverFramesRemaining = 0;
    }

    shouldTransmit(frame: Float32Array): boolean {
        if (this.warmupFramesRemaining > 0) {
            this.warmupFramesRemaining--;
            return false;
        }

        const rms = this.calculateRms(frame);
        if (rms >= this.options.rmsThreshold) {
            this.speechFrames++;
            this.hangoverFramesRemaining = this.options.hangoverFrames;
            return this.speechFrames >= this.options.startFrames;
        }

        this.speechFrames = 0;
        if (this.hangoverFramesRemaining > 0) {
            this.hangoverFramesRemaining--;
            return true;
        }

        return false;
    }

    private calculateRms(frame: Float32Array): number {
        let sumSquares = 0;
        for (let i = 0; i < frame.length; i++) {
            const sample = frame[i];
            sumSquares += sample * sample;
        }

        return Math.sqrt(sumSquares / frame.length);
    }
}
