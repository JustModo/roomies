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

/**
 * Manages the local microphone capture pipeline:
 *   getUserMedia → RNNoise AudioWorklet (noise suppression) → MediaStreamDestination
 *
 * The resulting `stream` is what gets fed into the encoder. Muting is done by
 * disabling the source track so no audio data enters the worklet graph.
 */
export class AudioManager {
    private readonly config: VoiceConfig;
    private localStream: MediaStream | null = null;
    private processedStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
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

    /**
     * Acquires a mic stream for the given deviceId. If the device is no longer
     * available (unplugged, or a stale saved preference), falls back to the
     * system default device rather than throwing.
     */
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
        if (this.rnnoiseNode) {
            this.rnnoiseNode.disconnect();
            this.rnnoiseNode.destroy();
            this.rnnoiseNode = null;
        }
        // Close AudioContext — this also disconnects all nodes
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.processedStream = null;
    }

    private async buildRnnoiseGraph(): Promise<void> {
        if (!this.localStream) return;
        // Attempt to wire up the RNNoise AudioWorklet for ML-based noise suppression.
        // Falls back to raw localStream if WASM/worklet fails.
        try {
            this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });

            const wasmBinary = await loadRnnoise({
                url: rnnoiseWasmPath,
                simdUrl: rnnoiseWasmSimdPath,
            });
            await this.audioContext.audioWorklet.addModule(rnnoiseWorkletPath);

            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
                wasmBinary,
                maxChannels: 1,
            });
            const destination = this.audioContext.createMediaStreamDestination();

            source.connect(this.rnnoiseNode);
            this.rnnoiseNode.connect(destination);

            this.processedStream = destination.stream;
        } catch (e) {
            console.warn('[AudioManager] RNNoise failed to load, using raw mic stream:', e);
            // processedStream stays null; callers fall back to localStream via the getter
        }
    }

    /**
     * Acquires the microphone and builds the RNNoise pipeline.
     * Safe to call multiple times — no-ops if already active.
     * If RNNoise fails to load, falls back to raw mic stream with a warning.
     */
    public async join(deviceId?: string): Promise<AcquireResult> {
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

        await this.buildRnnoiseGraph();

        return { usedFallback };
    }

    /**
     * Switches the active input device while a session is already live.
     * Acquires the new device first so a failure leaves the current mic intact.
     */
    public async switchInput(deviceId?: string): Promise<AcquireResult> {
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

        await this.buildRnnoiseGraph();

        return { usedFallback };
    }

    /**
     * Enables or disables the microphone track.
     * Disabling prevents audio data from flowing into the worklet graph entirely.
     */
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
