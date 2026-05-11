import type { ProxyKind } from './types.js';

/**
 * When no BACKEND_BASE_URL / backend_url is set, infer RDS host from the path username
 * (same segment as in `/{username}/{channel}/...`).
 *
 * Env: PROXY_RDS_HOST_SUFFIX (default `jotform.pro`). ChatGPT channels use `mcp-{username}`.
 */
export function defaultBackendBaseForUsername(
  username: string,
  kind: ProxyKind,
  env: NodeJS.ProcessEnv,
): string {
  const suffix = (env.PROXY_RDS_HOST_SUFFIX || 'jotform.pro').trim();
  const host = kind === 'chatgpt' ? `mcp-${username}` : username;
  return `https://${host}.${suffix}`;
}
