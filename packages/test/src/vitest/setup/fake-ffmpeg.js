#!/usr/bin/env node
// Stands in for FFMPEG_PATH in tests: ignores argv, stays alive (like a real
// in-progress encode) until killed, so it never trips the "exited with no
// output" failure path. Exits cleanly on the same signals worker.ts sends.
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
setInterval(() => {}, 60 * 60 * 1000);
