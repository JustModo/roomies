import { FastifyPluginAsync } from 'fastify';
import { AuthGuard } from '../auth/middleware';
import { LibraryController, SubtitleRoute, UploadRoute } from './controller';

export const libraryRoutes =
  (controller: LibraryController, guard: AuthGuard): FastifyPluginAsync =>
  async (app) => {
    // NOTE: Library scanning and subtitle management are restricted to root accounts.
    const rootOnly = { preHandler: guard.requireRole('root') };

    app.addHook('preHandler', guard.verifyJwt);

    app.get('/', controller.getLibraries);
    app.get<SubtitleRoute>('/subtitles/:subtitleId', controller.getSubtitle);
    app.post<UploadRoute>('/media/:mediaFileId/subtitles', rootOnly, controller.uploadSubtitle);
    app.delete<SubtitleRoute>('/subtitles/:subtitleId', rootOnly, controller.deleteSubtitle);
    app.post('/scan', rootOnly, controller.scan);
  };
