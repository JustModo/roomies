class PcmCapture extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0]?.[0];
        if (ch?.length) {
            const copy = new Float32Array(ch.length);
            copy.set(ch);
            this.port.postMessage(copy, [copy.buffer]);
        }
        return true;
    }
}

registerProcessor('roomies-pcm-capture', PcmCapture);
