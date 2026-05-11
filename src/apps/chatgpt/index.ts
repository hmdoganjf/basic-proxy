import { Router } from 'express';
import type { Logger } from 'pino';
import type { ProxyAppModule } from '../types.js';
import { publicBaseUrl } from '../../proxy/forwardHeaders.js';

function requireChatgpt(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  if (req.proxyCtx?.kind === 'chatgpt') {
    next();
    return;
  }
  next('router');
}

export const chatgptApp: ProxyAppModule = {
  kind: 'chatgpt',

  registerBeforeProxy(router: Router, log: Logger): void {
    const wk = Router({ mergeParams: true });
    wk.use(requireChatgpt);

    wk.get('/oauth-authorization-server', (req, res) => {
      const baseUrl = publicBaseUrl(req, req.proxyCtx!);
      log.info({ route: 'oauth-authorization-server', baseUrl }, 'well-known');
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register-public-client`,
        scopes_supported: [],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        token_endpoint_auth_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    });

    /** Exact + /suffix — `use` prefix-matches both. */
    wk.use('/oauth-protected-resource', (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      const baseUrl = publicBaseUrl(req, req.proxyCtx!);
      const tail = req.path.replace(/^\/oauth-protected-resource\/?/, '').replace(/\/$/, '');
      if (!tail) {
        log.info({ route: 'oauth-protected-resource', baseUrl }, 'well-known');
        res.json({
          resource: baseUrl,
          authorization_servers: [baseUrl],
          scopes_supported: [],
          bearer_methods_supported: ['header'],
        });
        return;
      }
      log.info({ route: 'oauth-protected-resource', baseUrl, resourcePath: tail }, 'well-known');
      res.json({
        resource: `${baseUrl}/${tail}`,
        authorization_servers: [baseUrl],
        scopes_supported: [],
        bearer_methods_supported: ['header'],
      });
    });

    router.use('/.well-known', wk);
  },
};
