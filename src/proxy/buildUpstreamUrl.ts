import type { ProxyKind } from '../config/types.js';

function joinBaseAndPath(base: string, pathWithQuery: string): string {
  const p = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  if (base.endsWith('/') && p.startsWith('/')) {
    return base.slice(0, -1) + p;
  }
  if (!base.endsWith('/') && !p.startsWith('/')) {
    return `${base}/${p}`;
  }
  return base + p;
}

export function buildUpstreamUrl(
  backendBase: string,
  kind: ProxyKind,
  method: string,
  incomingPathWithQuery: string,
): string {
  const isOauthish =
    incomingPathWithQuery.includes('oauth-authorization-server') ||
    incomingPathWithQuery.includes('oauth2') ||
    incomingPathWithQuery.includes('token') ||
    incomingPathWithQuery.includes('register-public-client') ||
    incomingPathWithQuery.includes('authorize');

  let base = backendBase;
  let path = incomingPathWithQuery;

  if (kind === 'chatgpt' && isOauthish) {
    base = backendBase.replace('mcp-', 'oauth2-');
    path = path.replace('/chatgpt-app', '');
  }
  if (kind === 'chatgpt' && method.toUpperCase() === 'GET') {
    path = path.replace('/chatgpt', '');
  }

  return joinBaseAndPath(base, path);
}
