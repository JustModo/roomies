import { FastifyReply, FastifyRequest } from 'fastify';
import { CreateGuestSchema } from '@roomies/contracts';
import { AuthService } from '../auth/service';
import { BadRequestError } from '../config/errors';
import { SocketHub } from '../websocket/hub';
import { UsersService } from './service';

export type UserRoute = { Params: { id: string } };

export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly hub: SocketHub,
  ) {}

  getMe = async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.users.getProfile(req.user!.userId));
  };

  getUsers = async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.users.getUsers());
  };

  deleteUser = async (req: FastifyRequest<UserRoute>, reply: FastifyReply) => {
    await this.users.deleteUser(req.params.id);
    this.hub.kickUser(req.params.id, 'account_deleted');
    return reply.status(204).send();
  };

  createGuest = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CreateGuestSchema.safeParse(req.body);
    if (!body.success) throw new BadRequestError('Invalid input', body.error.format());

    return reply.status(201).send(await this.auth.createGuest(body.data));
  };
}
