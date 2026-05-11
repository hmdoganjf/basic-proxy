export type ProxyKind = 'instagram' | 'chatgpt';

export interface ProxyContext {
  mode: 'path';
  /** Jotform / RDS username from the URL path (not the config profile key). */
  userKey: string;
  channelKey: string;
  backendBase: string;
  kind: ProxyKind;
  proxyConfigHeaders: Record<string, string> | null;
  alwaysReturn200: boolean;
  /** Public URL prefix for OAuth metadata, e.g. /{user}/{channel} */
  publicPathPrefix: string;
}

export interface ChannelBlock {
  BACKEND_BASE_URL?: string;
  headers?: Record<string, unknown>;
  /** Defaults from channel name when omitted (`chatgpt` → chatgpt). */
  kind?: ProxyKind;
}

export interface UserBlock {
  channels?: Record<string, ChannelBlock>;
  [key: string]: unknown;
}

export interface RootConfig {
  PORT?: number | string;
  ALWAYS_RETURN_200?: boolean | string;
  /** ngrok dashboard authtoken (or set `NGROK_AUTHTOKEN` instead). */
  ngrok_token?: string;
  /** Reserved tunnel hostname, e.g. `myapp.ngrok-free.app` (env `NGROK_DOMAIN` wins if set). */
  ngrok_domain?: string;
  /** Shown in startup example URL; path routing still uses the URL segment (often the same). */
  jotform_username?: string;
  [userKey: string]: unknown;
}
