import { FastifyPluginAsync } from 'fastify';
import { AuthGuard } from '../auth/middleware';
import { UserRoute, UsersController } from './controller';

export const userRoutes =
  (controller: UsersController, guard: AuthGuard): FastifyPluginAsync =>
  async (app) => {
    const rootOnly = { preHandler: guard.requireRole('root') };

    app.addHook('preHandler', guard.verifyJwt);

    app.get('/me', controller.getMe);
    app.get('/', rootOnly, controller.getUsers);
    app.delete<UserRoute>('/:id', rootOnly, controller.deleteUser);
    app.post('/guest', rootOnly, controller.createGuest);
  };
