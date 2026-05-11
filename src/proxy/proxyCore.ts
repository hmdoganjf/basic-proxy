import axios from 'axios';
import type { Logger } from 'pino';
import type { Request, Response, Router } from 'express';
import { buildUpstreamUrl } from './buildUpstreamUrl.js';
import { mergeForwardHeaders } from './forwardHeaders.js';
import { getProxyAppModule } from '../apps/registry.js';

function statusOr200(status: number, always200: boolean): number {
  return always200 ? 200 : status;
}

async function proxyAxios(
  req: Request,
  res: Response,
  log: Logger,
  method: 'get' | 'post' | 'options',
): Promise<void> {
  const ctx = req.proxyCtx!;
  const incomingPath = req.url || '/';
  const upstream = buildUpstreamUrl(ctx.backendBase, ctx.kind, method, incomingPath);
  const headers = mergeForwardHeaders(req.headers, ctx.proxyConfigHeaders);
  const child = log.child({
    user: ctx.userKey,
    channel: ctx.channelKey,
    kind: ctx.kind,
    mode: ctx.mode,
  });

  child.info({ upstream, method, path: incomingPath }, 'proxy request');

  try {
    const response = await axios({
      method,
      url: upstream,
      data: method === 'post' || method === 'options' ? req.body : undefined,
      headers,
      maxBodyLength: Infinity,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    const outStatus = statusOr200(response.status, ctx.alwaysReturn200);
    child.info({ upstreamStatus: response.status, outStatus }, 'proxy response');

    const mod = getProxyAppModule(ctx.kind);
    const handled =
      mod.afterUpstreamResponse?.({
        ctx,
        method,
        upstreamStatus: response.status,
        upstreamData: response.data,
        res,
        outStatus,
        log: child,
      }) ?? false;

    if (handled) {
      return;
    }

    res.status(outStatus).set(response.headers as never).send(response.data);
  } catch (e) {
    child.error({ err: e }, 'proxy error');
    const status = statusOr200(502, ctx.alwaysReturn200);
    res.status(status).send('Upstream error');
  }
}

export function registerDefaultProxy(router: Router, log: Logger): void {
  router.options('*', (req, res, next) => {
    if (!req.proxyCtx) {
      return next();
    }
    return void proxyAxios(req, res, log, 'options');
  });

  router.post('*', (req, res, next) => {
    if (!req.proxyCtx) {
      return next();
    }
    return void proxyAxios(req, res, log, 'post');
  });

  router.get('*', (req, res, next) => {
    if (!req.proxyCtx) {
      return next();
    }
    if (req.path.startsWith('/.well-known/')) {
      return next();
    }
    return void proxyAxios(req, res, log, 'get');
  });
}
