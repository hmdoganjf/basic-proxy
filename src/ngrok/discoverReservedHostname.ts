import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from 'pino';
import type { RootConfig } from '../config/types.js';

/**
 * Env `NGROK_DOMAIN` / `PROXY_NGROK_DOMAIN` wins over root `ngrok_domain` in config.json.
 */
export function mergeExplicitNgrokDomain(
  root: RootConfig,
  envDomain: string | undefined,
): string | undefined {
  const fromFile = typeof root.ngrok_domain === 'string' ? root.ngrok_domain.trim() : '';
  return envDomain?.trim() || fromFile || undefined;
}

function ngrokAgentConfigCandidates(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  const custom = env.NGROK_CONFIG_PATH?.trim();
  if (custom) {
    out.push(custom);
  }
  const home = os.homedir();
  const xdg = env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config');
  out.push(path.join(xdg, 'ngrok', 'ngrok.yml'));
  if (process.platform === 'darwin') {
    out.push(path.join(home, 'Library', 'Application Support', 'ngrok', 'ngrok.yml'));
  }
  out.push(path.join(home, '.ngrok2', 'ngrok.yml'));
  return [...new Set(out)];
}

function collectYamlHostnames(content: string): string[] {
  const found: string[] = [];
  for (const key of ['domain', 'hostname'] as const) {
    const re = new RegExp(`^\\s*${key}:\\s*['"]?([^#'"\\s]+)['"]?`, 'gm');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      found.push(m[1]!);
    }
  }
  return found;
}

function preferNgrokEdgeHost(candidates: string[]): string | undefined {
  const score = (h: string): number => {
    if (/ngrok-free\.app$/i.test(h)) {
      return 4;
    }
    if (/\.ngrok\.app$/i.test(h)) {
      return 3;
    }
    if (/\.ngrok\.dev$/i.test(h)) {
      return 2;
    }
    if (h.includes('.')) {
      return 1;
    }
    return 0;
  };
  const sorted = [...candidates].sort((a, b) => score(b) - score(a));
  return sorted[0];
}

function readYamlScalarFromFiles(env: NodeJS.ProcessEnv, scalarKey: string): string | undefined {
  const re = new RegExp(`^\\s*${scalarKey}:\\s*['"]?([^#'"\\s]+)['"]?`, 'm');
  for (const p of ngrokAgentConfigCandidates(env)) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      continue;
    }
    try {
      const text = fs.readFileSync(p, 'utf8');
      const m = text.match(re);
      const v = m?.[1]?.trim();
      if (v && v.length > 8) {
        return v;
      }
    } catch {
      /* ignore unreadable */
    }
  }
  return undefined;
}

function readHostnameFromNgrokAgentYaml(env: NodeJS.ProcessEnv): string | undefined {
  for (const p of ngrokAgentConfigCandidates(env)) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      continue;
    }
    try {
      const text = fs.readFileSync(p, 'utf8');
      const hosts = collectYamlHostnames(text);
      const best = preferNgrokEdgeHost(hosts);
      if (best) {
        return best;
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** ngrok REST API uses an API key, not the tunnel authtoken. */
async function fetchReservedHostnameFromApi(apiKey: string, log: Logger): Promise<string | undefined> {
  const url = 'https://api.ngrok.com/reserved_domains?limit=20';
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Ngrok-Version': '2',
      },
    });
    if (!res.ok) {
      log.debug({ status: res.status, url }, 'ngrok reserved_domains API not used');
      return undefined;
    }
    const data = (await res.json()) as {
      reserved_domains?: Array<{ domain?: string; hostname?: string }>;
    };
    const rows = data.reserved_domains ?? [];
    const hosts = rows.map((r) => r.domain || r.hostname).filter((h): h is string => Boolean(h?.trim()));
    return preferNgrokEdgeHost(hosts);
  } catch (e) {
    log.debug({ err: e }, 'ngrok reserved_domains fetch failed');
    return undefined;
  }
}

/**
 * Resolves a stable hostname for {@link ngrok.forward} `domain`, without requiring
 * `ngrok_domain` in basic-proxy config when discovery is possible.
 *
 * Priority:
 * 1. Explicit (env `NGROK_DOMAIN` / `PROXY_NGROK_DOMAIN` or root `ngrok_domain`)
 * 2. ngrok REST API — env `NGROK_API_KEY` or `api_key` in the agent `ngrok.yml` (not the tunnel authtoken)
 * 3. First suitable `domain` / `hostname` in the agent `ngrok.yml` (same paths the CLI uses)
 *
 * Tunnel **authtoken** alone cannot list account domains; that is a ngrok platform limitation.
 */
export async function discoverReservedNgrokHostname(opts: {
  explicit?: string | undefined;
  env: NodeJS.ProcessEnv;
  log: Logger;
}): Promise<string | undefined> {
  const { explicit, env, log } = opts;
  if (explicit?.trim()) {
    return explicit.trim();
  }

  const apiKey = env.NGROK_API_KEY?.trim() || readYamlScalarFromFiles(env, 'api_key');
  if (apiKey) {
    const fromApi = await fetchReservedHostnameFromApi(apiKey, log);
    if (fromApi) {
      log.info({ host: fromApi, source: 'ngrok-api' }, 'reserved hostname from ngrok API');
      return fromApi;
    }
  }

  const fromYaml = readHostnameFromNgrokAgentYaml(env);
  if (fromYaml) {
    log.info({ host: fromYaml, source: 'ngrok-agent-yml' }, 'reserved hostname from ngrok agent config');
    return fromYaml;
  }

  return undefined;
}
