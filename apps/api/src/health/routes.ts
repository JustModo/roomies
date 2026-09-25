import { FastifyPluginAsync } from 'fastify';
import { HealthController } from './controller';

export const healthRoutes =
  (controller: HealthController): FastifyPluginAsync =>
  async (app) => {
    // NOTE: Unauthenticated by design — the Docker healthcheck and uptime monitors
    // have no credentials, and this exposes only liveness and coarse server status.
    app.get('/', controller.status);
  };
