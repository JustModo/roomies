// @ts-ignore
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
// @ts-ignore
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
// @ts-ignore
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';

export class AudioManager {
    private localStream: MediaStream | null = null;
    private processedStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private rnnoiseNode: RnnoiseWorkletNode | null = null;

    public get hasLocalStream(): boolean {
        return this.localStream !== null;
    }

    public get stream(): MediaStream | null {
        return this.processedStream || this.localStream;
    }

    public async join(): Promise<void> {
        // If stream exists but tracks are dead (e.g. killed by mobile OS backgrounding), clean it up
        if (this.localStream && this.localStream.getAudioTracks().every(t => t.readyState === 'ended')) {
            this.leave();
        }

        if (this.localStream) return;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is not available (requires HTTPS or localhost).');
        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    noiseSuppression: true,
                    echoCancellation: true,
                    autoGainControl: true
                }, 
                video: false 
            });

            // Set up RNNoise AudioWorklet pipeline
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContextClass();
            
            const wasmBinary = await loadRnnoise({ 
                url: rnnoiseWasmPath,
                simdUrl: rnnoiseWasmSimdPath
            });
            await this.audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
            
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, { 
                wasmBinary,
                maxChannels: 2
            });
            const destination = this.audioContext.createMediaStreamDestination();
            
            source.connect(this.rnnoiseNode);
            this.rnnoiseNode.connect(destination);
            
            this.processedStream = destination.stream;
        } catch (e) {
            console.error('[WebRTC] Failed to get local audio', e);
            throw e;
        }
    }

    public toggleMute(muted: boolean) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }
    }

    public leave() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.processedStream) {
            this.processedStream.getTracks().forEach(track => track.stop());
            this.processedStream = null;
        }
        if (this.rnnoiseNode) {
            this.rnnoiseNode.destroy();
            this.rnnoiseNode.disconnect();
            this.rnnoiseNode = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
