import fs from 'node:fs';
import path from 'node:path';
import type { RootConfig } from './types.js';

/** Keys at the root of `config.json` that are not user profiles. */
const RESERVED = new Set(['PORT', 'ALWAYS_RETURN_200', 'ngrok_token', 'jotform_username', 'ngrok_domain']);

export function isConfigUserKey(key: string): boolean {
  return !RESERVED.has(key) && !key.startsWith('_');
}

export function loadRootConfig(configPath?: string): RootConfig {
  const p = configPath || process.env.BASIC_PROXY_CONFIG || path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(p)) {
    throw new Error(`config not found: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as RootConfig;
}

export function getListenPort(root: RootConfig): number {
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }
  const filePort = Number(root.PORT);
  if (Number.isFinite(filePort) && filePort > 0) {
    return filePort;
  }
  return 3000;
}

export function rootAlwaysReturn200(root: RootConfig): boolean {
  if (process.env.ALWAYS_RETURN_200 !== undefined) {
    return process.env.ALWAYS_RETURN_200 === 'true';
  }
  const v = root.ALWAYS_RETURN_200;
  return v === true || String(v).toLowerCase() === 'true';
}
