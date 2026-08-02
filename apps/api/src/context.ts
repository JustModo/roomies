import { PrismaClient } from '@prisma/client';
import { Config, ConfigManager } from '@roomies/config';
import { RoomStore } from './room/store';
import { SocketRouter, defaultSocketRouter } from './websocket/router';
import { TranscodeSessionManagerClass, createTranscodeSessionManager } from '@roomies/transcoding';
import { getPrisma } from './database/sqlite';

export interface AppContext {
  config: Config;
  prisma: PrismaClient;
  roomStore: RoomStore;
  socketRouter: SocketRouter;
  transcodeManager: TranscodeSessionManagerClass;
}

export interface AppContextOptions {
  configOverrides?: Partial<Config>;
  prisma?: PrismaClient;
  roomStore?: RoomStore;
  socketRouter?: SocketRouter;
  transcodeManager?: TranscodeSessionManagerClass;
}

export function createAppContext(options: AppContextOptions = {}): AppContext {
  const config = ConfigManager.load(options.configOverrides);
  const prisma = options.prisma || getPrisma();
  const roomStore = options.roomStore || new RoomStore();
  const socketRouter = options.socketRouter || defaultSocketRouter;
  const transcodeManager =
    options.transcodeManager || createTranscodeSessionManager({ cacheDir: config.CACHE_DIR });

  return {
    config,
    prisma,
    roomStore,
    socketRouter,
    transcodeManager,
  };
}
