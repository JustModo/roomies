import { FastifyPluginAsync } from 'fastify';
import { AuthController } from './controller';
import { AuthGuard } from './middleware';

export const authRoutes =
  (controller: AuthController, guard: AuthGuard): FastifyPluginAsync =>
  async (app) => {
    app.get('/status', controller.status);
    app.post('/setup', controller.setupRoot);
    app.post('/login', { preHandler: controller.rateLimitLogin }, controller.login);
    app.post('/refresh', controller.refresh);
    app.post('/logout', controller.logout);
    app.get('/media', { preHandler: guard.verifyMediaAccess }, controller.media);
  };
