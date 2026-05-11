import express, { type Request, type Response, type NextFunction, type Application } from 'express';
import type { Logger } from 'pino';
import type { RootConfig } from '../config/types.js';
import { getListenPort, rootAlwaysReturn200 } from '../config/loadRootConfig.js';
import { inferConfigProfileKey } from '../config/inferConfigProfileKey.js';
import { resolveRouteForUserChannel } from '../config/resolveRoute.js';
import { getTunnelPublicUrl } from '../ngrok/tunnelRuntime.js';
import { registerAllAppBeforeProxy } from '../apps/registry.js';
import { registerDefaultProxy } from './proxyCore.js';

export interface CreateAppOptions {
  /** Profile key in config.json (e.g. `default`). Defaults from env / single-profile inference. */
  profileKey?: string;
}

function attachPathContext(root: RootConfig, profileKey: string): express.RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const pathUsername = (req.params.pathUsername as string)?.trim() || '';
    const channelKey = (req.params.channelKey as string)?.trim() || '';
    try {
      const requestVars = {
        username: pathUsername,
        channel: channelKey,
        ngrok_url: getTunnelPublicUrl() ?? '',
      };
      const route = resolveRouteForUserChannel(root, profileKey, channelKey, undefined, process.env, requestVars);
      req.proxyCtx = {
        mode: 'path',
        userKey: pathUsername,
        channelKey: route.channelKey,
        backendBase: route.backend,
        kind: route.kind,
        proxyConfigHeaders: route.proxyConfigHeaders,
        alwaysReturn200: rootAlwaysReturn200(root),
        publicPathPrefix: `/${pathUsername}/${channelKey}`,
      };
      next();
    } catch (e) {
      res.status(404).type('text').send(String((e as Error).message));
    }
  };
}

export function createApp(root: RootConfig, log: Logger, opts?: CreateAppOptions): Application {
  const profileKey = opts?.profileKey ?? inferConfigProfileKey(root, process.env);

  const app = express();

  app.disable('x-powered-by');
  app.use(express.raw({ type: '*/*' }));

  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      port: getListenPort(root),
      profileKey,
      routing: '/:pathUsername/:channelKey/...',
      hint: 'pathUsername = Jotform/RDS user for upstream + ${#username}; profileKey = config block (PROXY_TUNNEL_USER or single profile).',
    });
  });

  const pathRouter = express.Router({ mergeParams: true });
  pathRouter.use(attachPathContext(root, profileKey));
  registerAllAppBeforeProxy(pathRouter, log);
  registerDefaultProxy(pathRouter, log);
  app.use('/:pathUsername/:channelKey', pathRouter);

  return app;
}
