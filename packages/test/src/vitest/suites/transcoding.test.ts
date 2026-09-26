import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

// Node's built-in child_process module exports aren't configurable, so vi.spyOn can't
// redefine `spawn` directly — mock the module instead (still calls the real spawn under
// the hood via vi.fn(actual.spawn), just makes calls trackable).
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

import { EventEmitter } from 'events';
import { loadConfig } from '@roomies/config';
import {
  EncoderBackend,
  TranscodeDeps,
  TranscodeSession,
  TranscodeSessionManager,
  TranscodeWorker,
  WorkerSlots,
  GroupStoppedError,
  READY_TIMEOUT_MS,
  RESOLUTION_PRESETS,
  SUPPORTED_RESOLUTIONS,
  SEGMENT_DURATION,
  buildHlsMuxArgs,
  audioBitrateFor,
  buildSeparateAudioEncodeArgs,
  ensureDirectory,
  countSegments,
  removeDirectory,
  transcodeOptionsFrom,
  variantsForSource,
  scaledResolution,
  SyncPolicy,
  AsyncPolicy,
  policyForSessionId,
} from '@roomies/transcoding';
import fs from 'fs';
import { spawn as mockedSpawn } from 'child_process';
import { silentLogger } from '../helpers/silentLogger';

const config = loadConfig();
const options = transcodeOptionsFrom(config);

const makeDeps = (maxConcurrentWorkers = options.maxConcurrentWorkers): TranscodeDeps => ({
  options: { ...options, maxConcurrentWorkers },
  encoder: new EncoderBackend(options.ffmpegPath, silentLogger),
  slots: new WorkerSlots(maxConcurrentWorkers),
  log: silentLogger,
});

const newSession = (sessionId: string, mediaFileId: string, outputDir: string, deps = makeDeps()) =>
  new TranscodeSession(deps, { sessionId, mediaFileId, inputPath: '/dev/null', outputDir });

const clean = (dir: string) => removeDirectory(dir, silentLogger);

describe('Transcoding & Quality Variant Pipeline', () => {
  it('zeroes the mpegts mux delay so audio PTS stays monotonic across segment cuts', () => {
    const args = buildHlsMuxArgs('/tmp/seg_%05d.ts');
    expect(args[args.indexOf('-muxdelay') + 1]).toBe('0');
    expect(args[args.indexOf('-muxpreload') + 1]).toBe('0');
  });

  it('rebuilds audio timestamps so a jittered source sample table cannot punch segment-boundary holes', () => {
    const args = buildSeparateAudioEncodeArgs(138150);
    expect(args.slice(0, 2)).toEqual(['-af', 'aresample=async=1']);
  });

  it('encodes the source frame rather than padding it into the rung box', () => {
    // 2.35:1 rip (1920x816) — no black bars baked in, aspect preserved, even dimensions.
    expect(scaledResolution(RESOLUTION_PRESETS['720p'], 1920, 816)).toEqual({ width: 1280, height: 544 });
    expect(scaledResolution(RESOLUTION_PRESETS['360p'], 1920, 816)).toEqual({ width: 640, height: 272 });
    // A true 16:9 source still fills its box exactly.
    expect(scaledResolution(RESOLUTION_PRESETS['720p'], 1920, 1080)).toEqual({ width: 1280, height: 720 });
    // Every rung keeps the same aspect, so ABR switches don't resize the picture.
    const a = scaledResolution(RESOLUTION_PRESETS['720p'], 1920, 816);
    const b = scaledResolution(RESOLUTION_PRESETS['360p'], 1920, 816);
    expect(a.width / a.height).toBeCloseTo(b.width / b.height, 2);
  });

  it('keeps every rung that does not enlarge the source, judged by scale not box height', () => {
    const full = SyncPolicy.variants;
    // 2.35:1 scope film: full-width 1080p source, so the 1080p rung is native (scale 1.0).
    // A box-height rule would drop it for being under 1080 tall and cap the film at 544p.
    expect(variantsForSource(full, 1920, 816)).toEqual(['360p', '720p', '1080p']);
    expect(scaledResolution(RESOLUTION_PRESETS['1080p'], 1920, 816)).toEqual({ width: 1920, height: 816 });
    // True 16:9 1080p behaves the same as before.
    expect(variantsForSource(full, 1920, 1080)).toEqual(['360p', '720p', '1080p']);
    // A 720p scope rip must not be upscaled into the 1080p rung.
    expect(variantsForSource(full, 1280, 536)).toEqual(['360p', '720p']);
    // Small source keeps only what fits, and never returns nothing.
    expect(variantsForSource(full, 640, 480)).toEqual(['360p']);
    expect(variantsForSource(full, 100, 100)).toEqual(['360p']);
    // Unknown source size prunes nothing.
    expect(variantsForSource(full, Infinity, Infinity)).toEqual(full);
  });

  it('never encodes audio below the source bitrate, capped at the top rung', () => {
    // Unknown source bitrate: leave the rung preset alone.
    expect(audioBitrateFor('96k', undefined)).toBe('96k');
    // Source above the rung (138k AAC rip on the 360p/720p rungs): lift it, with tandem headroom.
    expect(audioBitrateFor('96k', 138150)).toBe('192k');
    expect(audioBitrateFor('128k', 138150)).toBe('192k');
    // Source comfortably below the rung: no inflation.
    expect(audioBitrateFor('192k', 64000)).toBe('192k');
    expect(audioBitrateFor('96k', 48000)).toBe('96k');
    // Ceiling holds for a fat source.
    expect(audioBitrateFor('96k', 640000)).toBe('192k');
  });

  it('defines valid resolution presets for 1080p, 720p, and 360p', () => {
    expect(RESOLUTION_PRESETS['1080p']).toBeDefined();
    expect(RESOLUTION_PRESETS['720p']).toBeDefined();
    expect(RESOLUTION_PRESETS['360p']).toBeDefined();

    expect(RESOLUTION_PRESETS['1080p'].width).toBe(1920);
    expect(RESOLUTION_PRESETS['720p'].width).toBe(1280);
    expect(RESOLUTION_PRESETS['360p'].width).toBe(640);
  });

  it('cleans global transcode cache without throwing', () => {
    expect(() => new TranscodeSessionManager(options, silentLogger).clearCache()).not.toThrow();
  });

  it('resolves correct target bitrates for resolution variants', () => {
    expect(RESOLUTION_PRESETS['1080p'].videoBitrate).toBe('5000k');
    expect(RESOLUTION_PRESETS['720p'].videoBitrate).toBe('2500k');
    expect(RESOLUTION_PRESETS['360p'].videoBitrate).toBe('800k');
  });

  it('ensures directory helper creates recursively', () => {
    const testDir = `${process.env.CACHE_DIR}/nested/dir`;
    ensureDirectory(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
    clean(testDir);
  });

  it('counts consecutive segments on disk, resuming from a known count', () => {
    const testDir = `${process.env.CACHE_DIR}/variant-cache-stats`;
    ensureDirectory(testDir);
    for (let i = 0; i < 4; i++) {
      fs.writeFileSync(`${testDir}/seg_${String(i).padStart(5, '0')}.ts`, '');
    }

    expect(countSegments(testDir, 'seg')).toBe(4);
    expect(countSegments(testDir, 'seg', 2)).toBe(4);
    expect(countSegments(testDir, 'audio')).toBe(0);

    clean(testDir);
  });

  it('spawns exactly one ffmpeg process for a 3-resolution sync-scope offset group (single-decode optimization)', async () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();

    const testDir = `${process.env.CACHE_DIR}/group-spawn-test`;
    const session = newSession('sync', 'media-1', testDir);

    // Fire all 3 resolution requests roughly concurrently, like coordinator.ts's
    // Promise.allSettled prewarm does for a room-scope seek. Requests never resolve under
    // the fake-ffmpeg stub (no real segments get written), so don't await them.
    session.ensureVariantReady('360p', 0).catch(() => {});
    session.ensureVariantReady('720p', 0).catch(() => {});
    session.ensureVariantReady('1080p', 0).catch(() => {});

    // Let the microtask queue drain (getSourceFps() + the group's spawnProcess call).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ffmpegLikeCalls = spawnMock.mock.calls.filter((call: any[]) => Array.isArray(call[1]) && call[1].includes('-filter_complex'));
    expect(ffmpegLikeCalls).toHaveLength(1);

    const [, groupArgs] = ffmpegLikeCalls[0] as [string, string[]];
    expect(groupArgs.filter((a) => a === '-map')).toHaveLength(6);
    expect(groupArgs.filter((a) => a === '0:a:0?')).toHaveLength(3);

    await session.stop();
  });

  it('derives a sane concurrent worker cap from host CPU count when none is configured', () => {
    const { maxConcurrentWorkers } = transcodeOptionsFrom({ ...config, MAX_CONCURRENT_VARIANTS: undefined });
    expect(Number.isInteger(maxConcurrentWorkers)).toBe(true);
    expect(maxConcurrentWorkers).toBeGreaterThanOrEqual(4);
  });

  it('counts no segments for an empty or missing directory', () => {
    const testDir = `${process.env.CACHE_DIR}/variant-cache-stats-empty`;
    ensureDirectory(testDir);

    expect(countSegments(testDir, 'seg')).toBe(0);
    expect(countSegments(`${testDir}/missing`, 'seg')).toBe(0);

    clean(testDir);
  });

  it('exposes shared HLS mux args used by both encode strategies', () => {
    const args = buildHlsMuxArgs('/tmp/seg_%05d.ts');
    expect(args).toContain('-f');
    expect(args).toContain('hls');
    expect(args).toContain('-hls_time');
    expect(args).toContain(String(SEGMENT_DURATION));
    expect(args).toContain('/tmp/seg_%05d.ts');
    expect(args[args.indexOf('-hls_playlist_type') + 1]).toBe('event');
  });

  it('defines sync vs async mode policies, with async encoding only the ladder ends', () => {
    expect(SyncPolicy.variants).toEqual(SUPPORTED_RESOLUTIONS);
    expect(AsyncPolicy.variants).toEqual(SUPPORTED_RESOLUTIONS);
    expect(SyncPolicy.keepLatestEmptyOffset).toBe(true);
    expect(AsyncPolicy.keepLatestEmptyOffset).toBe(false);
    expect(SyncPolicy.ladderEnds).toBe(false);
    expect(AsyncPolicy.ladderEnds).toBe(true);
    expect(policyForSessionId('sync')).toBe(SyncPolicy);
    expect(policyForSessionId('async')).toBe(AsyncPolicy);
  });

  it('spawns one ffmpeg process encoding only the lowest and highest rungs for an async offset group', async () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();

    const testDir = `${process.env.CACHE_DIR}/async-group-spawn-test`;
    const session = newSession('async', 'media-1', testDir);

    session.ensureVariantReady('720p', 0).catch(() => {});
    session.ensureVariantReady('360p', 0).catch(() => {});
    session.ensureVariantReady('1080p', 0).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 50));

    const ffmpegLikeCalls = spawnMock.mock.calls.filter((call: any[]) => Array.isArray(call[1]) && call[1].includes('-filter_complex'));
    expect(ffmpegLikeCalls).toHaveLength(1);

    const [, groupArgs] = ffmpegLikeCalls[0] as [string, string[]];
    expect(groupArgs.filter((a) => a === '-map')).toHaveLength(4);
    expect(groupArgs.filter((a) => a === '0:a:0?')).toHaveLength(2);
    expect(groupArgs.some((a) => a.includes('scale=1280:720'))).toBe(false);

    await session.stop();
  });

  it("re-spawns a fresh worker when seeking back to an offset that was GC'd, instead of silently reusing a later offset's content", async () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();

    const testDir = `${process.env.CACHE_DIR}/gc-reseek-test`;
    const session = newSession('sync', 'media-1', testDir);

    // Two offset groups: 0 (will be abandoned) and 60 (stays active, so 0 is not
    // "latest" and is eligible for GC).
    session.ensureVariantReady('720p', 0).catch(() => {});
    session.ensureVariantReady('720p', 60).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    const variantGroups = (session as any).variantGroups as Map<number, unknown>;
    expect(variantGroups.has(0)).toBe(true);
    expect(variantGroups.has(60)).toBe(true);

    // No playheads reference offset 0 and its grace period has elapsed — GC it.
    (session as any).groupCreatedAt.set(0, Date.now() - 20000);
    (session as any).cleanupOffsetIfEmpty(0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(variantGroups.has(0)).toBe(false);
    expect(variantGroups.has(60)).toBe(true);

    // Seeking back to 0 must spawn a genuinely NEW worker for offset 0 — not
    // silently redirect to (and instantly resolve against) offset 60's worker,
    // which is what the removed mergedOffsets redirect used to do.
    spawnMock.mockClear();
    session.ensureVariantReady('720p', 0).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    const freshSpawnCalls = spawnMock.mock.calls.filter((call: any[]) => Array.isArray(call[1]) && call[1].includes('-filter_complex'));
    expect(freshSpawnCalls).toHaveLength(1);
    expect(variantGroups.has(0)).toBe(true);

    await session.stop();
  });

  it('GCs a stale higher-numbered offset after a backward seek, instead of protecting it as "latest" (sync keepLatestEmptyOffset)', async () => {
    const testDir = `${process.env.CACHE_DIR}/backward-seek-gc-test`;
    const session = newSession('sync', 'media-1', testDir);

    // Offset 120 is created first (e.g. user was far into the video)...
    session.ensureVariantReady('720p', 120).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    // ...then the user seeks backward to 0, creating a NEW, numerically-lower
    // offset that is nonetheless the truly active one.
    session.ensureVariantReady('720p', 0).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));

    const variantGroups = (session as any).variantGroups as Map<number, unknown>;
    expect(variantGroups.has(120)).toBe(true);
    expect(variantGroups.has(0)).toBe(true);

    // Age both past the grace period, preserving which was created more recently:
    // 120 is the stale one now, 0 is "latest" despite being numerically smaller.
    (session as any).groupCreatedAt.set(120, Date.now() - 20000);
    (session as any).groupCreatedAt.set(0, Date.now() - 19000);

    // No playheads reference 120 anymore (the room's playhead moved to 0).
    (session as any).cleanupOffsetIfEmpty(120);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(variantGroups.has(120)).toBe(false); // stale offset GC'd
    expect(variantGroups.has(0)).toBe(true); // active offset kept

    await session.stop();
  });

  describe('worker lifecycle', () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    let realSpawn: typeof import('child_process').spawn;

    const fakeChild = () => {
      const proc: any = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = (signal: string) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') setImmediate(() => proc.emit('exit', null, signal));
        return true;
      };
      return proc;
    };

    const groupsOf = (session: TranscodeSession) => (session as any).variantGroups as Map<number, TranscodeWorker>;

    beforeAll(async () => {
      realSpawn = (await vi.importActual<typeof import('child_process')>('child_process')).spawn;
    });

    afterEach(() => {
      vi.useRealTimers();
      spawnMock.mockImplementation(realSpawn);
    });

    it('rejects a pending variant request when FFmpeg exits before producing segments', async () => {
      spawnMock.mockImplementationOnce((_cmd: string, _args: string[], opts: any) =>
        realSpawn(process.execPath, ['-e', 'process.exit(0)'], opts),
      );
      const session = newSession('sync', 'media-exit', `${process.env.CACHE_DIR}/exit-before-ready`);

      await expect(session.ensureVariantReady('720p', 0)).rejects.toThrow(/produced no output/);
      expect(groupsOf(session).has(0)).toBe(false);

      await session.stop();
    });

    it('rejects and stops the group when no segment appears within READY_TIMEOUT_MS', async () => {
      const deps = makeDeps();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const session = newSession('sync', 'media-timeout', `${process.env.CACHE_DIR}/ready-timeout`, deps);

      const pending = session.ensureVariantReady('720p', 0);
      const outcome = expect(pending).rejects.toThrow(/Timed out/);
      await vi.waitFor(() => expect(groupsOf(session).has(0)).toBe(true));
      await Promise.resolve();

      vi.advanceTimersByTime(READY_TIMEOUT_MS);
      await outcome;
      expect(groupsOf(session).has(0)).toBe(false);

      vi.useRealTimers();
      await vi.waitFor(() => expect(deps.slots.count).toBe(0));
      await session.stop();
    });

    it('does not register a worker whose FFmpeg failed to spawn, so the next request retries', async () => {
      const deps = makeDeps();
      spawnMock.mockImplementationOnce(() => {
        throw new Error('spawn EACCES');
      });
      const session = newSession('sync', 'media-spawn-fail', `${process.env.CACHE_DIR}/spawn-fail`, deps);

      await expect(session.ensureVariantReady('720p', 0)).rejects.toThrow('spawn EACCES');
      expect(groupsOf(session).has(0)).toBe(false);
      expect(deps.slots.count).toBe(0);

      spawnMock.mockImplementation(fakeChild);
      session.ensureVariantReady('720p', 0).catch(() => {});
      await vi.waitFor(() => expect(groupsOf(session).has(0)).toBe(true));
      expect(deps.slots.count).toBe(1);

      await session.stop();
      expect(deps.slots.count).toBe(0);
    });

    it('counts live FFmpeg processes across workers and refuses new workers at the cap', async () => {
      spawnMock.mockImplementation(fakeChild);
      const deps = makeDeps(4);
      const workers = Array.from({ length: 4 }, (_, i) => {
        const worker = new TranscodeWorker(deps, {
          sessionId: 'cap',
          resolutions: ['360p'],
          legDirs: new Map([['360p', `${process.env.CACHE_DIR}/cap/${i}`]]),
        });
        worker.start({ inputPath: '/dev/null' });
        return worker;
      });
      expect(deps.slots.count).toBe(4);

      const session = newSession('sync', 'media-cap', `${process.env.CACHE_DIR}/cap-session`, deps);
      await expect(session.ensureVariantReady('720p', 0)).rejects.toThrow(/Maximum concurrent/);
      expect(groupsOf(session).size).toBe(0);

      await Promise.all(workers.map((w) => w.stop()));
      expect(deps.slots.count).toBe(0);
      await session.stop();
      clean(`${process.env.CACHE_DIR}/cap`);
    });

    it('evicts the oldest idle group of another session instead of refusing at the cap', async () => {
      spawnMock.mockImplementation(fakeChild);
      const manager = new TranscodeSessionManager({ ...options, maxConcurrentWorkers: 1 }, silentLogger);

      const sync = manager.startSession('sync', 'media-evict', '/dev/null');
      sync.ensureVariantReady('720p', 0).catch(() => {});
      await vi.waitFor(() => expect(groupsOf(sync).has(0)).toBe(true));

      const async = manager.startSession('async', 'media-evict', '/dev/null');
      async.ensureVariantReady('720p', 30).catch(() => {});
      await vi.waitFor(() => expect(groupsOf(async).has(30)).toBe(true));

      expect(groupsOf(sync).has(0)).toBe(false);
      await manager.stopAll();
    });

    it('rejects a pending playlist wait with GroupStoppedError when its group is stopped', async () => {
      spawnMock.mockImplementation(fakeChild);
      const session = newSession('sync', 'media-stopped', `${process.env.CACHE_DIR}/stopped-wait`);
      const pending = session.ensureVariantReady('720p', 0);
      await vi.waitFor(() => expect(groupsOf(session).has(0)).toBe(true));

      await session.stopGroup(0);

      await expect(pending).rejects.toBeInstanceOf(GroupStoppedError);
      await session.stop();
    });

    it('stops groups superseded by a newer seek target but keeps groups viewers are on', async () => {
      spawnMock.mockImplementation(fakeChild);
      const session = newSession('sync', 'media-superseded', `${process.env.CACHE_DIR}/superseded`);
      for (const offset of [0, 60, 120]) session.ensureVariantReady('720p', offset).catch(() => {});
      await vi.waitFor(() => expect(groupsOf(session).size).toBe(3));
      (session as any).playheads.set('viewer', { position: 10, currentOffset: 0, lastSeenAt: Date.now() });

      session.stopIdleGroups(120);

      expect([...groupsOf(session).keys()].sort((a, b) => a - b)).toEqual([0, 120]);
      await session.stop();
    });

    it('parks the previous sync session on its newest group and revives it when its media returns', async () => {
      spawnMock.mockImplementation(fakeChild);
      const manager = new TranscodeSessionManager(options, silentLogger);

      const first = manager.startSession('sync', 'media-a', '/dev/null');
      first.ensureVariantReady('720p', 0).catch(() => {});
      first.ensureVariantReady('720p', 60).catch(() => {});
      await vi.waitFor(() => expect(groupsOf(first).size).toBe(2));
      (first as any).groupCreatedAt.set(0, Date.now() - 1000);

      const second = manager.startSession('sync', 'media-b', '/dev/null');
      expect(manager.getSession('sync')).toBe(second);
      expect([...groupsOf(first).keys()]).toEqual([60]);

      expect(manager.startSession('sync', 'media-a', '/dev/null')).toBe(first);
      expect(manager.getSession('sync')).toBe(first);
      expect(groupsOf(first).has(60)).toBe(true);

      await manager.stopAll();
      expect(groupsOf(first).size).toBe(0);
      expect(groupsOf(second).size).toBe(0);
    });
  });

  describe('hardware encoder argument building', () => {
    const argsFor = (hw: 'qsv' | 'vaapi' | null) => {
      const worker = new TranscodeWorker(makeDeps(), {
        sessionId: 'sync',
        resolutions: ['720p'],
        legDirs: new Map([['720p', '/tmp/hw-args/720p']]),
      });
      (worker as any).input = { inputPath: '/media/in.mkv', startPosition: 0, sourceFps: 24 };
      return (worker as any).buildArgs(hw) as string[];
    };

    it('initialises the QSV device globally before the input and encodes with h264_qsv', () => {
      const args = argsFor('qsv');
      const inputAt = args.indexOf('-i');

      expect(args.indexOf('-init_hw_device')).toBeLessThan(inputAt);
      expect(args[args.indexOf('-init_hw_device') + 1]).toMatch(/^qsv=hw:hw,child_device=\/dev\/dri\/renderD\d+$/);
      expect(args.indexOf('-filter_hw_device')).toBeLessThan(inputAt);
      expect(args[args.indexOf('-filter_hw_device') + 1]).toBe('hw');
      expect(args[args.indexOf('-filter_complex') + 1]).toContain('format=nv12,hwupload=extra_hw_frames=64');
      expect(args[args.indexOf('-c:v') + 1]).toBe('h264_qsv');
    });

    it('sets the VAAPI device globally before the input and encodes with h264_vaapi', () => {
      const args = argsFor('vaapi');

      expect(args.indexOf('-vaapi_device')).toBeLessThan(args.indexOf('-i'));
      expect(args[args.indexOf('-filter_complex') + 1]).toContain('format=nv12,hwupload[');
      expect(args[args.indexOf('-c:v') + 1]).toBe('h264_vaapi');
      expect(args).not.toContain('-init_hw_device');
    });

    it('encodes on the CPU without live-streaming tuning', () => {
      const args = argsFor(null);
      expect(args).not.toContain('-tune');
      expect(args).not.toContain('zerolatency');
    });
  });

  it('counts demuxed audio_*.ts segments', () => {
    const testDir = `${process.env.CACHE_DIR}/audio-cache-stats`;
    ensureDirectory(testDir);
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(`${testDir}/audio_${String(i).padStart(5, '0')}.ts`, '');
    }
    fs.writeFileSync(`${testDir}/playlist.m3u8`, '');

    expect(countSegments(testDir, 'audio')).toBe(3);

    clean(testDir);
  });
});
