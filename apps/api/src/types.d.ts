declare module 'ffprobe-static' {
  const ffprobeStatic: {
    path: string;
  };
  export default ffprobeStatic;
}

import { WebSocket } from '@fastify/websocket';

declare module 'fastify' {
  interface FastifyInstance {
    room: Set<WebSocket>;
  }
}
