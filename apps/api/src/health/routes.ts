import { FastifyInstance } from 'fastify';
import { HealthController } from './controller';

export const healthRoutes = async (app: FastifyInstance) => {
  // NOTE: Unauthenticated by design — the Docker healthcheck and uptime monitors
  // have no credentials, and this exposes only liveness and coarse server status.
  app.get('/', HealthController.status);
};
