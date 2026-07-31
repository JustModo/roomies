# Test Plan: Transcoding & FFmpeg Worker Pipeline

## Module Overview
This module covers video transcoding pipelines, resolution variant generation (`1080p`, `720p`, `360p`), HLS master playlist generation (`master.m3u8`), segment creation (`segment0.ts`, `segment1.ts`), look-ahead generation thresholds (`LOOK_AHEAD_SEGMENTS`), hardware acceleration detection (`nvenc`, `qsv`, `vaapi`, `videotoolbox`, CPU fallback), FFmpeg CLI process args, mid-stream seek offset shifts, and transcode cache isolation (`uniqueRunId`).

**Total Test Cases**: 35 (TC-XCODE-001 to TC-XCODE-035)

---

## Detailed Test Case Specifications

### Category 1: Resolution Variants & Playlist Generation (TC-XCODE-001 to TC-XCODE-008)

#### TC-XCODE-001: 1080p Resolution Preset Generation
- **Objective**: Verify 1080p variant produces video stream at 1920x1080 resolution with target bitrate 5000k.
- **Input**: Video input file `test.mp4`.
- **Expected Outcome**: FFmpeg flags include `-s 1920x1080 -b:v 5000k`.

#### TC-XCODE-002: 720p Resolution Preset Generation
- **Objective**: Verify 720p variant produces video stream at 1280x720 resolution with target bitrate 2500k.
- **Input**: Video input file `test.mp4`.
- **Expected Outcome**: FFmpeg flags include `-s 1280x720 -b:v 2500k`.

#### TC-XCODE-003: 360p Resolution Preset Generation
- **Objective**: Verify 360p variant produces video stream at 640x360 resolution with target bitrate 800k.
- **Input**: Video input file `test.mp4`.
- **Expected Outcome**: FFmpeg flags include `-s 640x360 -b:v 800k`.

#### TC-XCODE-004: HLS Master Playlist Generation (`master.m3u8`)
- **Objective**: Verify master playlist contains correct `#EXT-X-STREAM-INF` headers listing bandwidths and resolution variants.
- **Input**: `TranscodeSession.getMasterPlaylist()`.
- **Expected Outcome**: Master playlist contains valid HLS syntax referencing `1080p/playlist.m3u8`, `720p/playlist.m3u8`, `360p/playlist.m3u8`.

#### TC-XCODE-005: Variant HLS Playlist Generation (`playlist.m3u8`)
- **Objective**: Verify variant playlist formatted with `#EXT-X-TARGETDURATION:6` and `#EXTINF:6.000` tags for 6-second segments.
- **Input**: `TranscodeSession.getVariantPlaylist("1080p")`.
- **Expected Outcome**: Valid M3U8 payload with target duration set to 6 seconds.

#### TC-XCODE-006: Audio Stream Encoding Preset (AAC 128k)
- **Objective**: Verify audio stream transcoded to AAC codec at 128kbps stereo (`-c:a aac -b:a 128k -ac 2`).
- **Input**: Source video with AC3/DTS multi-channel audio.
- **Expected Outcome**: FFmpeg output contains AAC stereo 128k audio stream.

#### TC-XCODE-007: Custom Target Bitrate Override
- **Objective**: Verify custom bitrate option overrides preset bitrate.
- **Input**: Transcode options `{ customBitrate: "3000k" }`.
- **Expected Outcome**: FFmpeg command uses `-b:v 3000k`.

#### TC-XCODE-008: Source Aspect Ratio Preservation
- **Objective**: Verify non-standard aspect ratio videos (e.g. 21:9 ultrawide) use scale filters preserving aspect ratio (`scale=1920:-2`).
- **Input**: 21:9 source video (`2560x1080`).
- **Expected Outcome**: Output video scaled without stretching distortion.

---

### Category 2: HLS Segmenter & Look-Ahead Engine (TC-XCODE-009 to TC-XCODE-016)

#### TC-XCODE-009: HLS Segment Naming Pattern
- **Objective**: Verify generated segment filenames match `segment%d.ts` pattern (`segment0.ts`, `segment1.ts`, etc.).
- **Input**: Worker transcode start.
- **Expected Outcome**: Segments created with 0-indexed sequential numeric filenames.

#### TC-XCODE-010: Segment Duration Accuracy (6.0 Seconds)
- **Objective**: Verify each HLS segment duration is exactly 6.0 seconds (within +/- 0.1s tolerance).
- **Input**: Transcode 30-second video clip.
- **Expected Outcome**: 5 segments generated, each approx 6s duration.

#### TC-XCODE-011: Look-Ahead Segment Generation Threshold (`LOOK_AHEAD_SEGMENTS = 4`)
- **Objective**: Verify FFmpeg worker transcodes at least 4 segments ahead of active playhead segment.
- **Input**: Playhead at segment 2 (`12s`).
- **Expected Outcome**: Worker ensures segments 0 through 6 are generated and available in disk cache.

#### TC-XCODE-012: Throttling FFmpeg Worker at Look-Ahead Boundary
- **Objective**: Verify FFmpeg worker pauses/throttles when generated segments exceed `MAX_LOOK_AHEAD_SEGMENTS` (10 segments ahead).
- **Input**: Playhead at segment 0 (`0s`), worker generated segment 10 (`60s`).
- **Expected Outcome**: Worker process throttled to reduce CPU/GPU utilization.

#### TC-XCODE-013: Resuming Throttled Worker on Playhead Progress
- **Objective**: Verify worker resumes transcoding when playhead advances closer to look-ahead frontier.
- **Input**: Playhead advances from segment 0 to segment 5.
- **Expected Outcome**: Worker automatically resumes transcoding segment 11+.

#### TC-XCODE-014: Missing Segment On-Demand Generation
- **Objective**: Verify requesting segment that has not been generated yet triggers immediate priority transcoding.
- **Input**: HTTP request for `segment8.ts` while worker is at `segment3.ts`.
- **Expected Outcome**: Worker jumps priority to transcode `segment8.ts` on-demand.

#### TC-XCODE-015: Non-Existent Segment 404 Handling
- **Objective**: Verify requesting segment index beyond media total duration returns 404 Not Found.
- **Input**: HTTP request for `segment999.ts` on a 60-second video.
- **Expected Outcome**: HTTP 404 returned cleanly.

#### TC-XCODE-016: Segment Keyframe Alignment (`-g 144 -keyint_min 144`)
- **Objective**: Verify FFmpeg forces GOP size / keyframe placement at exact 6-second intervals (24fps * 6s = 144 frames).
- **Input**: Video stream transcoding.
- **Expected Outcome**: Every TS segment begins cleanly with an IDR/I-keyframe.

---

### Category 3: Hardware Acceleration Engine (TC-XCODE-017 to TC-XCODE-024)

#### TC-XCODE-017: NVIDIA NVENC Hardware Encoder Detection (`h264_nvenc`)
- **Objective**: Verify system detects NVIDIA GPU availability and configures `h264_nvenc` encoder.
- **Input**: `detectEncoderBackend()`.
- **Expected Outcome**: Returns `'nvenc'`, FFmpeg flags use `-c:v h264_nvenc -preset p4`.

#### TC-XCODE-018: Intel QuickSync Hardware Encoder Detection (`h264_qsv`)
- **Objective**: Verify Intel QSV detection configures `h264_qsv` encoder flags.
- **Input**: System with QSV support.
- **Expected Outcome**: Returns `'qsv'`, FFmpeg flags use `-c:v h264_qsv`.

#### TC-XCODE-019: VAAPI Hardware Encoder Detection (`h264_vaapi`)
- **Objective**: Verify VAAPI Linux hardware acceleration detection.
- **Input**: System with VAAPI support.
- **Expected Outcome**: Returns `'vaapi'`, FFmpeg flags use `-vf format=nv12,hwupload -c:v h264_vaapi`.

#### TC-XCODE-020: Apple VideoToolbox Detection (`h264_videotoolbox`)
- **Objective**: Verify macOS VideoToolbox detection.
- **Input**: macOS system environment.
- **Expected Outcome**: Returns `'videotoolbox'`, FFmpeg flags use `-c:v h264_videotoolbox`.

#### TC-XCODE-021: Software CPU Fallback (`libx264`)
- **Objective**: Verify system falls back to CPU software transcoding (`libx264`) when no GPU acceleration is present.
- **Input**: Environment with no GPU drivers installed.
- **Expected Outcome**: Returns `'cpu'`, FFmpeg flags use `-c:v libx264 -preset ultrafast`.

#### TC-XCODE-022: Hardware Encoder Failure Auto-Fallback to CPU
- **Objective**: Verify that if NVENC fails at runtime (e.g. out of memory), session automatically falls back to `libx264`.
- **Input**: NVENC process exits with error code 1.
- **Expected Outcome**: Transcoder catches error, falls back to CPU `libx264`, and resumes segment creation.

#### TC-XCODE-023: Hardware Acceleration Status Endpoint API
- **Objective**: Verify API endpoint `/api/transcode/status` returns current active encoder backend.
- **Input**: `GET /api/transcode/status`.
- **Expected Outcome**: HTTP 200 returned with `{ backend: "nvenc" | "qsv" | "vaapi" | "cpu" }`.

#### TC-XCODE-024: Zero Copy Hardware Decoding (`-hwaccel cuda`)
- **Objective**: Verify CUDA hardware decoder flag passed when NVENC is active.
- **Input**: NVENC backend active.
- **Expected Outcome**: FFmpeg command includes `-hwaccel cuda`.

---

### Category 4: Seek Offset Shifts & Transcode Offsets (TC-XCODE-025 to TC-XCODE-030)

#### TC-XCODE-025: Mid-Stream Seek Offset Transcode Re-Initialization
- **Objective**: Verify seeking to 450s on a 1000s video restarts FFmpeg input stream with `-ss 450`.
- **Input**: Seek command at position 450.0s.
- **Expected Outcome**: FFmpeg launched with `-ss 450.0`, transcode offset set to 450.0s.

#### TC-XCODE-026: Segment Index Remapping with Transcode Offset
- **Objective**: Verify segment sequence numbers and playlist `#EXT-X-MEDIA-SEQUENCE` updated when seeking.
- **Input**: Seek to 300s (segment 50).
- **Expected Outcome**: `#EXT-X-MEDIA-SEQUENCE:50` set in variant playlist.

#### TC-XCODE-027: Backward Seek Transcode Re-Initialization
- **Objective**: Verify seeking backward from 500s to 60s terminates running FFmpeg worker and starts new worker at `-ss 60.0`.
- **Input**: Backward seek request to 60.0s.
- **Expected Outcome**: Old worker killed, new worker spawned at `-ss 60.0`.

#### TC-XCODE-028: Sub-Segment Seek Precision Alignment
- **Objective**: Verify seeking to non-segment boundary (e.g. 14.3s) aligns to nearest keyframe segment boundary (12.0s).
- **Input**: Seek to 14.3s.
- **Expected Outcome**: Transcode offset calculated as 12.0s (segment 2).

#### TC-XCODE-029: Rapid Consecutively Dispatched Seek Requests
- **Objective**: Verify 5 rapid seek requests in 200ms cancel previous FFmpeg workers cleanly without hanging processes.
- **Input**: Rapid seek sequence: 10s -> 50s -> 100s -> 200s -> 300s.
- **Expected Outcome**: Final FFmpeg worker running at `-ss 300.0`; all prior workers terminated.

#### TC-XCODE-030: Zero-Offset Reset on Video Restart
- **Objective**: Verify seeking back to 0s resets transcode offset to 0.0s and sequence number to 0.
- **Input**: Seek to 0.0s.
- **Expected Outcome**: Transcode offset = 0.0s, media sequence = 0.

---

### Category 5: Cache Isolation & Directory Garbage Collection (TC-XCODE-031 to TC-XCODE-035)

#### TC-XCODE-031: Session Directory Cache Isolation (`uniqueRunId`)
- **Objective**: Verify each transcode session uses a unique directory incorporating `uniqueRunId`.
- **Input**: Create 2 separate transcode sessions for the same media file.
- **Expected Outcome**: Output paths contain unique run IDs, preventing cache overwrite.

#### TC-XCODE-032: Global Cache Clean Operation (`cleanGlobalCache`)
- **Objective**: Verify calling `TranscodeCache.cleanGlobalCache()` purges all temporary transcode directories.
- **Input**: Populate cache with test files, invoke `cleanGlobalCache()`.
- **Expected Outcome**: Cache directory contents deleted completely without error.

#### TC-XCODE-033: Active Session Directory Exclusion During Cleaning
- **Objective**: Verify global cache cleaner preserves directories currently used by active transcode sessions.
- **Input**: 1 active session running, 2 stale session folders present.
- **Expected Outcome**: Stale folders deleted; active session folder preserved.

#### TC-XCODE-034: Disk Space Cap Enforcement Threshold
- **Objective**: Verify transcode cache cleaner purges oldest segments when disk usage exceeds `MAX_CACHE_SIZE_BYTES` (5GB).
- **Input**: Cache directory populated past threshold.
- **Expected Outcome**: LRU (least recently used) segments deleted until cache size drops below cap.

#### TC-XCODE-035: Full Integrated Transcode Pipeline Test
- **Objective**: End-to-end verification of master playlist generation, variant stream transcode, segment creation, seek shift, and final cache cleanup.
- **Input**: Full transcode pipeline test execution.
- **Expected Outcome**: 100% assertions pass across all pipeline stages.
