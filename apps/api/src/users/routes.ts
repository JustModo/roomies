import { FastifyInstance } from 'fastify';
import { UsersController } from './controller';
import { verifyJwt } from '../auth/middleware';

export const userRoutes = async (app: FastifyInstance) => {
  // Apply JWT verification middleware to all routes in this plugin
  app.addHook('preHandler', verifyJwt);

  app.get('/me', UsersController.getMe);
  app.get('/', UsersController.getUsers);
  app.delete('/:id', UsersController.deleteUser);
  app.post('/guest', UsersController.createGuest);
};
