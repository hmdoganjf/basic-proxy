import type { Response, Router } from 'express';
import type { Logger } from 'pino';
import type { ProxyContext, ProxyKind } from '../config/types.js';

/**
 * Per–proxy-kind behavior: routes that run after {@link ProxyContext} is attached
 * and before the default axios upstream proxy, plus optional response shaping.
 */
export interface ProxyAppModule {
  readonly kind: ProxyKind;

  /**
   * Register handlers on the same `/:pathUsername/:channelKey` router (mergeParams).
   * Use explicit paths; each handler should `next()` when {@link ProxyContext#kind}
   * does not match this app.
   */
  registerBeforeProxy(router: Router, log: Logger): void;

  /**
   * After a successful upstream response. Return true if the response body was already sent.
   */
  afterUpstreamResponse?(args: {
    ctx: ProxyContext;
    method: string;
    upstreamStatus: number;
    upstreamData: unknown;
    res: Response;
    outStatus: number;
    log: Logger;
  }): boolean;
}
