import type { RootConfig, UserBlock } from './types.js';
import { isConfigUserKey } from './loadRootConfig.js';

function asUserBlock(v: unknown): UserBlock | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as UserBlock;
  }
  return null;
}

/**
 * Config key whose `channels` block is used (e.g. `default`).
 * The URL path `/:pathUsername/:channelKey` uses **pathUsername** only for upstream host + `${#username}` — it does not need to match this key.
 */
export function inferConfigProfileKey(root: RootConfig, env: NodeJS.ProcessEnv): string {
  const explicit = env.PROXY_TUNNEL_USER?.trim();
  if (explicit) {
    if (!isConfigUserKey(explicit)) {
      throw new Error(`PROXY_TUNNEL_USER "${explicit}" is not a valid profile key (reserved or malformed).`);
    }
    if (!asUserBlock(root[explicit])) {
      throw new Error(`No profile ["${explicit}"] in config.json`);
    }
    return explicit;
  }
  const keys = Object.keys(root).filter(isConfigUserKey);
  if (keys.length === 1) {
    const k = keys[0]!;
    if (!asUserBlock(root[k])) {
      throw new Error(`Profile ["${k}"] must be an object with optional "channels" in config.json`);
    }
    return k;
  }
  if (keys.length === 0) {
    throw new Error('config.json has no profile blocks (add a key with { "channels": { ... } }).');
  }
  throw new Error(`Set PROXY_TUNNEL_USER to the profile key to use (one of: ${keys.join(', ')}).`);
}
