import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import type { Config } from '@roomies/config';
import { LibraryService, libraryOptionsFrom } from '@roomies/library';
import { TranscodeSessionManager, transcodeOptionsFrom } from '@roomies/transcoding';
import { AuthController } from './auth/controller';
import { AuthGuard } from './auth/middleware';
import { AuthService } from './auth/service';
import { ChatService } from './chat/service';
import { registerChatSocketEvents } from './chat/socket';
import { AuthSecrets } from './config';
import { HealthController } from './health/controller';
import { LibraryController } from './library/controller';
import { PartyService } from './party/service';
import { registerPartySocketEvents } from './party/socket';
import { PlaybackController } from './playback/controller';
import { PlaybackCoordinator } from './playback/coordinator';
import { PlaybackService } from './playback/service';
import { registerPlaybackSocketEvents, registerTranscodeEvents } from './playback/socket';
import { RoomService } from './room/service';
import { registerRoomSocketEvents } from './room/socket';
import { RoomStore } from './room/store';
import { SyncService } from './sync/service';
import { registerSyncSocketEvents } from './sync/socket';
import { UsersController } from './users/controller';
import { UsersService } from './users/service';
import { VoiceGateway } from './voice/gateway';
import { VoiceManager } from './voice/manager';
import { WebsocketGateway } from './websocket/gateway';
import { SocketHub } from './websocket/hub';
import { SocketRouter } from './websocket/router';

export type AppContext = ReturnType<typeof createAppContext>;

/** Composition root: the only place that constructs services and wires their dependencies. */
export function createAppContext(config: Config, prisma: PrismaClient, secrets: AuthSecrets, log: FastifyBaseLogger) {
  const logger = (module: string) => log.child({ module });

  const transcoder = new TranscodeSessionManager(transcodeOptionsFrom(config), logger('transcode'));
  const libraryOptions = libraryOptionsFrom(config);
  const library = new LibraryService(prisma, libraryOptions, logger('library'));

  const roomStore = new RoomStore();
  const voice = new VoiceManager(logger('voice'));
  const hub = new SocketHub(voice);
  const router = new SocketRouter(logger('socket'));

  const auth = new AuthService(prisma, secrets);
  const guard = new AuthGuard(auth);
  const users = new UsersService(prisma);

  const coordinator = new PlaybackCoordinator(prisma, roomStore, transcoder, logger('coordinator'));
  const sync = new SyncService(roomStore, hub, coordinator, logger('sync'));
  const room = new RoomService(roomStore, hub, coordinator, sync);
  const playback = new PlaybackService(prisma, roomStore, hub, coordinator, transcoder, logger('playback'));
  const chat = new ChatService(hub);
  const party = new PartyService(roomStore, hub);

  registerRoomSocketEvents(router, room);
  registerSyncSocketEvents(router, sync);
  registerPlaybackSocketEvents(router, playback);
  registerChatSocketEvents(router, chat);
  registerPartySocketEvents(router, party);
  registerTranscodeEvents(transcoder, hub, logger('transcode'));

  return {
    prisma,
    transcoder,
    library,
    roomStore,
    hub,
    guard,
    controllers: {
      auth: new AuthController(auth, hub),
      users: new UsersController(users, auth, hub),
      library: new LibraryController(library, prisma, libraryOptions),
      health: new HealthController(prisma, transcoder, logger('health')),
      playback: new PlaybackController(playback, roomStore),
    },
    gateways: {
      websocket: new WebsocketGateway(guard, hub, router, logger('websocket')),
      voice: new VoiceGateway(guard, voice, logger('voice')),
    },
  };
}
