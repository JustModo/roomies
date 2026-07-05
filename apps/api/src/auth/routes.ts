import { FastifyInstance } from 'fastify';
import { AuthController } from './controller';
import { LoginSchema, RegisterSchema } from '@roomies/contracts';

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/register', async (req, reply) => {
    // Validate request body using Zod
    const parsedBody = RegisterSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request data', details: parsedBody.error.format() });
    }
    
    // Pass strictly typed and validated data to controller
    req.body = parsedBody.data;
    return AuthController.register(req as any, reply);
  });

  app.post('/login', async (req, reply) => {
    const parsedBody = LoginSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request data', details: parsedBody.error.format() });
    }
    
    req.body = parsedBody.data;
    return AuthController.login(req as any, reply);
  });
};
