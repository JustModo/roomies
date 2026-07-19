// @ts-ignore — Vite URL import for RNNoise WASM assets
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
// @ts-ignore
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
// @ts-ignore
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import { DEFAULT_VOICE_CONFIG } from '../config';
import type { VoiceConfig } from '../config';

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

    /**
     * Acquires the microphone and builds the RNNoise pipeline.
     * Safe to call multiple times — no-ops if already active.
     * If RNNoise fails to load, falls back to raw mic stream with a warning.
     */
    public async join(): Promise<void> {
        // Revive dead mic tracks (e.g. killed by mobile OS backgrounding)
        if (this.localStream && this.localStream.getAudioTracks().every(t => t.readyState === 'ended')) {
            this.leave();
        }

        if (this.localStream) return;

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Microphone access is not available (requires HTTPS or localhost).');
        }

        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: { ideal: 1 },
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: false },
                autoGainControl: { ideal: false },
                sampleRate: this.config.sampleRate,
                // Chromium-only today; ignored by browsers that do not support it.
                suppressLocalAudioPlayback: { ideal: true },
            },
            video: false,
        } as MediaStreamConstraints);

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
        // Stop raw mic tracks to release the OS microphone indicator
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        // processedStream is owned by the AudioContext destination; no tracks to stop
        this.processedStream = null;
    }
}
