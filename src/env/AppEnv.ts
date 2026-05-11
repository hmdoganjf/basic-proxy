import fs from 'node:fs';
import path from 'node:path';
import type { RootConfig } from '../config/types.js';
import { isConfigUserKey } from '../config/loadRootConfig.js';

function readString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key];
  if (v === undefined || v === '') {
    return undefined;
  }
  return v.trim();
}

function readBool(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const v = readString(env, key);
  if (v === undefined) {
    return undefined;
  }
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function readPort(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const v = readString(env, key);
  if (!v) {
    return undefined;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Pretty logs when unset: on for interactive terminals, off under CI. */
function defaultLogPretty(env: NodeJS.ProcessEnv): boolean {
  if (env.CI === '1' || env.CI === 'true') {
    return false;
  }
  return process.stdout.isTTY;
}

/**
 * Process environment read once at startup.
 */
export class AppEnv {
  readonly configPath: string;
  readonly tunnelUser: string;
  readonly listenPortOverride: number | undefined;
  readonly logLevel: string;
  readonly logPretty: boolean;
  readonly ngrokDisabled: boolean;
  readonly alwaysReturn200Override: boolean | undefined;
  readonly ngrokReservedDomain: string | undefined;

  private constructor(init: {
    configPath: string;
    tunnelUser: string;
    listenPortOverride: number | undefined;
    logLevel: string;
    logPretty: boolean;
    ngrokDisabled: boolean;
    alwaysReturn200Override: boolean | undefined;
    ngrokReservedDomain: string | undefined;
  }) {
    this.configPath = init.configPath;
    this.tunnelUser = init.tunnelUser;
    this.listenPortOverride = init.listenPortOverride;
    this.logLevel = init.logLevel;
    this.logPretty = init.logPretty;
    this.ngrokDisabled = init.ngrokDisabled;
    this.alwaysReturn200Override = init.alwaysReturn200Override;
    this.ngrokReservedDomain = init.ngrokReservedDomain;
  }

  static load(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): AppEnv {
    const configPath =
      readString(env, 'PROXY_CONFIG_PATH') ||
      path.join(process.cwd(), 'config.json');

    const listenPortOverride = readPort(env, 'PROXY_LISTEN_PORT') ?? readPort(env, 'PORT');

    const tunnelFromArg = argv[2]?.trim();
    const tunnelUser =
      readString(env, 'PROXY_TUNNEL_USER') || tunnelFromArg || AppEnv.inferTunnelUserOrThrow(configPath);

    return new AppEnv({
      configPath,
      tunnelUser,
      listenPortOverride,
      logLevel: readString(env, 'PROXY_LOG_LEVEL') || 'info',
      logPretty: readBool(env, 'PROXY_LOG_PRETTY') ?? defaultLogPretty(env),
      ngrokDisabled: readBool(env, 'PROXY_NGROK_DISABLED') ?? false,
      alwaysReturn200Override: readBool(env, 'PROXY_ALWAYS_RETURN_200'),
      ngrokReservedDomain: readString(env, 'NGROK_DOMAIN') ?? readString(env, 'PROXY_NGROK_DOMAIN'),
    });
  }

  private static inferTunnelUserOrThrow(configPath: string): string {
    if (!fs.existsSync(configPath)) {
      throw new Error(`PROXY_TUNNEL_USER not set and config missing: ${configPath}`);
    }
    const root = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RootConfig;
    const candidates = Object.keys(root).filter(isConfigUserKey);
    if (candidates.length === 1) {
      return candidates[0]!;
    }
    throw new Error(
      `Set PROXY_TUNNEL_USER (or pass as CLI arg). Multiple profiles in config: ${candidates.join(', ')}`,
    );
  }

  listenPort(root: RootConfig): number {
    if (this.listenPortOverride !== undefined) {
      return this.listenPortOverride;
    }
    const filePort = Number(root.PORT);
    if (Number.isFinite(filePort) && filePort > 0) {
      return filePort;
    }
    return 3000;
  }

  alwaysReturn200(root: RootConfig): boolean {
    if (this.alwaysReturn200Override !== undefined) {
      return this.alwaysReturn200Override;
    }
    const v = root.ALWAYS_RETURN_200;
    return v === true || String(v).toLowerCase() === 'true';
  }
}
