import { createDecoder } from 'libopus-wasm';
import type { OpusDecoderHandle } from 'libopus-wasm';
import type { VoiceConfig } from '../config';
import { JitterBuffer } from './JitterBuffer';
import type { PlayoutAction } from './JitterBuffer';

export class PeerPlayer {
    private readonly ctx: AudioContext;
    private readonly gainNode: GainNode;
    private readonly analyserNode: AnalyserNode;
    private readonly config: VoiceConfig;
    private readonly jitter: JitterBuffer;
    private readonly frameSeconds: number;
    private readonly timer: ReturnType<typeof setInterval>;
    private decoder: OpusDecoderHandle | null = null;
    private nextPlayTime = 0;
    private volume = 100;
    private muted = false;
    private destroyed = false;

    constructor(ctx: AudioContext, config: VoiceConfig, output: AudioNode) {
        this.ctx = ctx;
        this.config = config;
        this.jitter = new JitterBuffer(config.playback.jitter);
        this.frameSeconds = config.frameSize / config.sampleRate;
        this.gainNode = ctx.createGain();
        this.analyserNode = ctx.createAnalyser();
        this.analyserNode.fftSize = 256;

        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(output);

        void createDecoder({
            channels: config.channels,
            sampleRate: config.sampleRate,
        }).then((dec) => {
            if (this.destroyed) dec.free();
            else this.decoder = dec;
        }, (e) => console.warn('[PeerPlayer] Decoder init error:', e));

        this.timer = setInterval(() => this.tick(), config.playback.tickMs);
    }

    getVolume(): number {
        const data = new Float32Array(this.analyserNode.fftSize);
        this.analyserNode.getFloatTimeDomainData(data);

        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
            sumSquares += data[i] * data[i];
        }
        return Math.sqrt(sumSquares / data.length);
    }

    /** Sets this peer's gain. `volume` is 0–200, where 100 is unity gain. */
    setVolume(volume: number): void {
        this.volume = volume;
        this.applyGain();
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.applyGain();
    }

    private applyGain(): void {
        this.gainNode.gain.setTargetAtTime(
            this.muted ? 0 : Math.max(0, Math.min(2, this.volume / 100)),
            this.ctx.currentTime,
            this.config.playback.gainRampSeconds
        );
    }

    push(seq: number, packet: Uint8Array): void {
        if (this.destroyed) return;
        this.jitter.push(seq, packet);
        this.tick();
    }

    private tick(): void {
        if (this.destroyed || !this.decoder) return;
        const now = this.ctx.currentTime;
        if (this.nextPlayTime < now) this.nextPlayTime = now + this.frameSeconds;

        while (this.nextPlayTime < now + this.config.playback.scheduleAheadSeconds) {
            const action = this.jitter.pop();
            if (action.kind !== 'idle') this.schedule(this.decode(this.decoder, action));
            this.nextPlayTime += this.frameSeconds;
        }
    }

    private decode(dec: OpusDecoderHandle, action: Exclude<PlayoutAction, { kind: 'idle' }>): Float32Array | null {
        const frameSize = this.config.frameSize;
        try {
            switch (action.kind) {
                case 'play':
                    return dec.decodeFloat(action.packet);
                case 'fec':
                    return dec.decodeFloat(action.packet, { decodeFec: true, frameSize });
                case 'plc':
                    return dec.decodeFloat(null, { frameSize });
            }
        } catch (e) {
            console.warn('[PeerPlayer] Decode error:', e);
            return null;
        }
    }

    private schedule(pcm: Float32Array | null): void {
        if (!pcm || pcm.length === 0) return;
        const buffer = this.ctx.createBuffer(this.config.channels, pcm.length, this.config.sampleRate);
        buffer.copyToChannel(new Float32Array(pcm), 0);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.gainNode);
        src.start(this.nextPlayTime);
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        clearInterval(this.timer);
        this.decoder?.free();
        this.decoder = null;
        this.gainNode.disconnect();
        this.analyserNode.disconnect();
    }
}
