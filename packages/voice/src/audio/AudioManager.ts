// @ts-ignore — Vite URL import for RNNoise WASM assets
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
// @ts-ignore
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
// @ts-ignore
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import { DEFAULT_VOICE_CONFIG } from '../config';
import type { VoiceConfig } from '../config';

export interface AcquireResult {
    /** True if the requested deviceId was unavailable and the default device was used instead. */
    usedFallback: boolean;
}

/** Fired when the active input track ends unexpectedly (e.g. the device was unplugged). */
export type TrackEndedCallback = () => void;

/** Manages local microphone capture and RNNoise noise suppression pipeline. */
export class AudioManager {
    private readonly config: VoiceConfig;
    private localStream: MediaStream | null = null;
    private processedStream: MediaStream | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private destinationNode: MediaStreamAudioDestinationNode | null = null;
    private rnnoiseNode: RnnoiseWorkletNode | null = null;
    private currentDeviceId: string | undefined;

    /** Called when the active input track ends unexpectedly (e.g. device unplugged). */
    public onTrackEnded?: TrackEndedCallback;

    constructor(config: VoiceConfig = DEFAULT_VOICE_CONFIG) {
        this.config = config;
    }

    public get hasLocalStream(): boolean {
        return this.localStream !== null;
    }

    /** The processed (noise-suppressed) stream to pass to the encoder. */
    public get stream(): MediaStream | null {
        return this.processedStream ?? this.localStream;
    }

    /** The deviceId currently in use, or undefined if using the system default. */
    public get deviceId(): string | undefined {
        return this.currentDeviceId;
    }

    private buildConstraints(deviceId?: string): MediaStreamConstraints {
        return {
            audio: {
                channelCount: { ideal: 1 },
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: false },
                autoGainControl: { ideal: false },
                sampleRate: this.config.sampleRate,
                // Chromium-only today; ignored by browsers that do not support it.
                suppressLocalAudioPlayback: { ideal: true },
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
            video: false,
        } as MediaStreamConstraints;
    }

    /** Acquires a mic stream with fallback to default device if target is unavailable. */
    private async acquireStream(deviceId?: string): Promise<{ stream: MediaStream; usedFallback: boolean }> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(this.buildConstraints(deviceId));
            return { stream, usedFallback: false };
        } catch (e) {
            const isDeviceUnavailable =
                e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError');
            if (deviceId && isDeviceUnavailable) {
                console.warn('[AudioManager] Preferred input device unavailable, falling back to default:', e);
                const stream = await navigator.mediaDevices.getUserMedia(this.buildConstraints(undefined));
                return { stream, usedFallback: true };
            }
            throw e;
        }
    }

    private wireTrackEndedListener(): void {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.addEventListener('ended', () => this.onTrackEnded?.(), { once: true });
        });
    }

    private teardownProcessingGraph(): void {
        this.sourceNode?.disconnect();
        this.sourceNode = null;
        if (this.rnnoiseNode) {
            this.rnnoiseNode.disconnect();
            this.rnnoiseNode.destroy();
            this.rnnoiseNode = null;
        }
        this.destinationNode?.disconnect();
        this.destinationNode = null;
        this.processedStream = null;
    }

    /**
     * Wires RNNoise into the caller's own AudioContext (rather than creating a
     * second one) so capture stays on a single audio clock — bridging two
     * independently-clocked AudioContexts via a MediaStream causes intermittent
     * underrun/drift glitches.
     */
    private async buildRnnoiseGraph(ctx: AudioContext): Promise<void> {
        if (!this.localStream) return;
        try {
            const wasmBinary = await loadRnnoise({
                url: rnnoiseWasmPath,
                simdUrl: rnnoiseWasmSimdPath,
            });
            await ctx.audioWorklet.addModule(rnnoiseWorkletPath);

            const source = ctx.createMediaStreamSource(this.localStream);
            this.rnnoiseNode = new RnnoiseWorkletNode(ctx, {
                wasmBinary,
                maxChannels: 1,
            });
            const destination = ctx.createMediaStreamDestination();

            source.connect(this.rnnoiseNode);
            this.rnnoiseNode.connect(destination);

            this.sourceNode = source;
            this.destinationNode = destination;
            this.processedStream = destination.stream;
        } catch (e) {
            console.warn('[AudioManager] RNNoise failed to load, using raw mic stream:', e);
            // processedStream stays null; callers fall back to localStream via the getter
        }
    }

    /** Acquires microphone stream and builds the RNNoise processing graph inside `ctx`. */
    public async join(deviceId: string | undefined, ctx: AudioContext): Promise<AcquireResult> {
        // Revive dead mic tracks (e.g. killed by mobile OS backgrounding)
        if (this.localStream && this.localStream.getAudioTracks().every(t => t.readyState === 'ended')) {
            this.leave();
        }

        if (this.localStream) return { usedFallback: false };

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Microphone access is not available (requires HTTPS or localhost).');
        }

        const { stream, usedFallback } = await this.acquireStream(deviceId);
        this.localStream = stream;
        this.currentDeviceId = usedFallback ? undefined : deviceId;
        this.wireTrackEndedListener();

        await this.buildRnnoiseGraph(ctx);

        return { usedFallback };
    }

    /** Switches active input device while maintaining live session state. */
    public async switchInput(deviceId: string | undefined, ctx: AudioContext): Promise<AcquireResult> {
        const wasMuted = this.localStream?.getAudioTracks().some(t => !t.enabled) ?? false;

        const { stream, usedFallback } = await this.acquireStream(deviceId);

        this.teardownProcessingGraph();
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
        }

        this.localStream = stream;
        this.currentDeviceId = usedFallback ? undefined : deviceId;
        this.wireTrackEndedListener();
        if (wasMuted) this.setMuted(true);

        await this.buildRnnoiseGraph(ctx);

        return { usedFallback };
    }

    /** Enables or disables the local microphone stream tracks. */
    public setMuted(muted: boolean): void {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }
    }

    /** Stops all tracks and tears down the audio processing graph. */
    public leave(): void {
        this.teardownProcessingGraph();
        // Stop raw mic tracks to release the OS microphone indicator
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        this.currentDeviceId = undefined;
    }
}
