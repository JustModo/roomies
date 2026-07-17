export function optimizeSDP(sdp: string): string {
    const match = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
    if (!match) return sdp;

    const payloadType = match[1];
    const fmtpRegex = new RegExp(`a=fmtp:${payloadType} (.*)`);
    
    if (fmtpRegex.test(sdp)) {
        return sdp.replace(fmtpRegex, `a=fmtp:${payloadType} $1;usedtx=1;useinbandfec=1;stereo=0`);
    } else {
        return sdp.replace(
            new RegExp(`(a=rtpmap:${payloadType} opus\\/48000\\/2\\r\\n)`),
            `$1a=fmtp:${payloadType} usedtx=1;useinbandfec=1;stereo=0\r\n`
        );
    }
}
