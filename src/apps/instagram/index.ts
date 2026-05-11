import type { Router } from 'express';
import type { Logger } from 'pino';
import type { ProxyAppModule } from '../types.js';

export const instagramApp: ProxyAppModule = {
  kind: 'instagram',

  registerBeforeProxy(_router: Router, _log: Logger): void {
    // Example: mount routes that must run before the default proxy:
    // _router.get('/health', (req, res) => res.json({ ok: true }));
    // Handlers should start with `if (req.proxyCtx?.kind !== 'instagram') return next('route');`
    // or use a nested Router + `next('router')` like `src/apps/chatgpt`.
  },

  afterUpstreamResponse({ ctx, method, upstreamStatus, upstreamData, res, outStatus }): boolean {
    if (method !== 'get' || ctx.kind !== 'instagram') {
      return false;
    }
    const isRedirect = upstreamStatus >= 300 && upstreamStatus < 400;
    const data = upstreamData;
    if (!isRedirect && data && typeof data === 'object' && 'content' in data) {
      res.status(outStatus).send(String((data as { content: unknown }).content));
      return true;
    }
    return false;
  },
};
