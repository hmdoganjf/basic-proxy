import type { ChannelBlock, ProxyKind, RootConfig, UserBlock } from './types.js';
import { defaultBackendBaseForUsername } from './inferDevBackend.js';

const TEMPLATE_RESOLVE_MAX_PASSES = 24;

function isAssocObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value as object);
  if (keys.length === 0) {
    return false;
  }
  return keys.some((k, i) => k !== String(i));
}

/** `${#key}` → requestVars; `${key}` → ctx (multi-pass). */
export function deepResolveTemplates(
  value: unknown,
  ctx: Record<string, string>,
  requestVars: Record<string, string> = {},
  maxPasses = TEMPLATE_RESOLVE_MAX_PASSES,
): unknown {
  if (typeof value === 'string') {
    let s = value;
    for (let i = 0; i < maxPasses; i++) {
      const passHash = s.replace(/\$\{#\s*([a-zA-Z0-9_]+)\s*\}/g, (_, name: string) => {
        const v = requestVars[name.trim()];
        return v != null ? String(v) : '';
      });
      const passCtx = passHash.replace(/\$\{\s*([^}#]+?)\s*\}/g, (_, name: string) => {
        const key = name.trim();
        const v = ctx[key];
        return v != null ? String(v) : '';
      });
      if (passCtx === s) {
        break;
      }
      s = passCtx;
    }
    return s;
  }
  if (Array.isArray(value)) {
    return value.map((x) => deepResolveTemplates(x, ctx, requestVars, maxPasses));
  }
  if (value && typeof value === 'object' && isAssocObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepResolveTemplates(v, ctx, requestVars, maxPasses);
    }
    return out;
  }
  return value;
}

function flattenConfigForProxy(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(node)) {
    const pathSeg = prefix === '' ? name : `${prefix}::${name}`;
    if (value && typeof value === 'object' && !Array.isArray(value) && isAssocObject(value)) {
      Object.assign(out, flattenConfigForProxy(value as Record<string, unknown>, pathSeg));
    } else if (value !== undefined && value !== null) {
      out[pathSeg] = String(value);
    }
  }
  return out;
}

/**
 * HTTP header name for a flattened config path. Must match PHP
 * {@see \Jotform\AIAgentChannels\Helpers\AIAgentChannelsConfigHelper::proxyConfigServerKeyForConfigKey}
 * (`::` → `__`, prefix `HTTP_X_PROXY_CONFIG_` added by the server from `X-Proxy-Config-...`).
 */
export function proxyConfigHeaderName(configKey: string): string {
  return `x-proxy-config-${configKey.replace(/::/g, '__')}`;
}

export function buildProxyConfigHeaders(resolvedHeaders: Record<string, unknown>): Record<string, string> {
  const flat = flattenConfigForProxy(resolvedHeaders);
  const headers: Record<string, string> = {};
  for (const [configKey, val] of Object.entries(flat)) {
    headers[proxyConfigHeaderName(configKey)] = val;
  }
  return headers;
}

export function inferKind(channelKey: string, ch?: ChannelBlock): ProxyKind {
  if (ch?.kind === 'chatgpt' || ch?.kind === 'instagram') {
    return ch.kind;
  }
  return channelKey === 'chatgpt' ? 'chatgpt' : 'instagram';
}

function asUserBlock(v: unknown): UserBlock | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as UserBlock;
  }
  return null;
}

function pickChannelKey(ub: UserBlock, usecaseOrChannel: string, explicitChannel: string | undefined): string | null {
  const explicit = (explicitChannel ?? '').trim();
  if (explicit && ub.channels?.[explicit]) {
    return explicit;
  }
  if (!explicit && ub.channels?.[usecaseOrChannel]) {
    return usecaseOrChannel;
  }
  return null;
}

/**
 * Upstream origin for axios. PHP never reads this from headers — only the proxy uses it.
 * Optional `BACKEND_BASE_URL` env overrides channel JSON (same name as typical deployment env).
 */
function resolveUpstreamBase(
  env: NodeJS.ProcessEnv,
  ch: ChannelBlock,
  pathUsername: string,
  kind: ProxyKind,
): string {
  const fromEnv = env.BACKEND_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromChannel = ch.BACKEND_BASE_URL?.trim();
  if (fromChannel) {
    return fromChannel;
  }
  if (!pathUsername) {
    throw new Error('Cannot infer upstream host: missing username in path / requestVars');
  }
  return defaultBackendBaseForUsername(pathUsername, kind, env);
}

/**
 * Static `${name}` values for `headers` templates. PHP resolves the resulting
 * `X-Proxy-Config-*` headers in dev via {@see AIAgentChannelsConfigHelper::getFromHeaderOrConfig}
 * using the same flattened key paths (e.g. `WEBHOOK_BASE_URL`).
 *
 * We expose both `BACKEND_BASE_URL` and `backend_url` (and ngrok pairs) so snippets can use either style.
 */
function staticTemplatePlaceholders(upstreamBase: string, publicTunnelUrl: string): Record<string, string> {
  return {
    BACKEND_BASE_URL: upstreamBase,
    backend_url: upstreamBase,
    NGROK_URL: publicTunnelUrl,
    ngrok_url: publicTunnelUrl,
  };
}

export interface ResolvedRoute {
  backend: string;
  proxyConfigHeaders: Record<string, string> | null;
  channelKey: string;
  kind: ProxyKind;
}

export function resolveRouteForUserChannel(
  root: RootConfig,
  profileKey: string,
  usecaseOrChannel: string,
  explicitChannel: string | undefined,
  env: NodeJS.ProcessEnv,
  requestVars: Record<string, string> = {},
): ResolvedRoute {
  const ub = asUserBlock(root[profileKey]);
  if (!ub) {
    throw new Error(`Unknown profile "${profileKey}" in config.json`);
  }

  const channelKey = pickChannelKey(ub, usecaseOrChannel, explicitChannel);
  if (!channelKey || !ub.channels?.[channelKey]) {
    if ((explicitChannel ?? '').trim()) {
      throw new Error(`Channel "${explicitChannel}" not found under profile ["${profileKey}"].channels`);
    }
    throw new Error(
      `No channel "${usecaseOrChannel}" under profile ["${profileKey}"].channels — path is /:pathUsername/:channelKey/...`,
    );
  }

  const ch = ub.channels[channelKey]!;
  const pathUsername = (requestVars.username ?? '').trim() || profileKey.trim();
  const kind = inferKind(channelKey, ch);
  const backend = resolveUpstreamBase(env, ch, pathUsername, kind);

  let proxyConfigHeaders: Record<string, string> | null = null;
  if (ch.headers && typeof ch.headers === 'object') {
    const publicTunnel = (requestVars.ngrok_url || '').trim();
    const ctx = staticTemplatePlaceholders(backend, publicTunnel);
    const resolved = deepResolveTemplates(ch.headers, ctx, requestVars, TEMPLATE_RESOLVE_MAX_PASSES) as Record<
      string,
      unknown
    >;
    proxyConfigHeaders = buildProxyConfigHeaders(resolved);
  }

  return {
    backend,
    proxyConfigHeaders,
    channelKey,
    kind,
  };
}
