import type { ProxyContext } from '../config/types.js';
import type { IncomingHttpHeaders } from 'node:http';

export function mergeForwardHeaders(
  incoming: IncomingHttpHeaders,
  proxyConfigHeaders: Record<string, string> | null,
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = { ...incoming };
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  delete headers['host'];

  for (const k of Object.keys(headers)) {
    if (k.toLowerCase().startsWith('x-proxy-config-')) {
      delete headers[k];
    }
  }
  if (proxyConfigHeaders) {
    Object.assign(headers, proxyConfigHeaders);
  }
  return headers;
}

export function publicBaseUrl(req: { protocol: string; headers: IncomingHttpHeaders }, ctx: ProxyContext): string {
  const xfProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(xfProto) ? xfProto[0] : xfProto) || 'https';
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as string;
  return `${proto}://${host}${ctx.publicPathPrefix}`;
}
