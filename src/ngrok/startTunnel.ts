import ngrok from '@ngrok/ngrok';
import type { Logger } from 'pino';
import { ngrokHttpsUrlToDomain } from './ngrokDomain.js';
import { setTunnelPublicUrl } from './tunnelRuntime.js';

export interface TunnelResult {
  publicUrl: string;
  disconnect: () => Promise<void>;
}

export interface StartTunnelOptions {
  listenPort: number;
  reservedDomain?: string | null;
  ngrokDisabled: boolean;
  log: Logger;
  /** ngrok authtoken; if omitted, uses `NGROK_AUTHTOKEN` when ngrok is enabled. */
  authtoken?: string | null;
}

/**
 * Embedded tunnel via `@ngrok/ngrok`. Public URL comes from {@link ngrok.Listener#url}.
 */
export async function startEmbeddedNgrok(opts: StartTunnelOptions): Promise<TunnelResult | null> {
  if (opts.ngrokDisabled) {
    opts.log.warn('ngrok disabled — HTTP only on listen port');
    setTunnelPublicUrl(null);
    return null;
  }

  const token = (opts.authtoken?.trim() || process.env.NGROK_AUTHTOKEN?.trim()) ?? '';
  if (!token) {
    throw new Error('ngrok is enabled but no authtoken: set `ngrok_token` in config.json or `NGROK_AUTHTOKEN` in the environment.');
  }

  const forwardOpts: {
    addr: number;
    authtoken: string;
    onLogEvent: (line: string) => void;
    domain?: string;
  } = {
    addr: opts.listenPort,
    authtoken: token,
    onLogEvent: (line: string) => opts.log.debug({ src: 'ngrok' }, line),
  };

  if (opts.reservedDomain?.trim()) {
    const raw = opts.reservedDomain.trim();
    forwardOpts.domain = raw.includes('://') ? ngrokHttpsUrlToDomain(raw) : raw;
  }

  const listener = await ngrok.forward(forwardOpts);
  const publicUrl = listener.url() ?? '';
  setTunnelPublicUrl(publicUrl || null);
  opts.log.info(
    { publicUrl, listenPort: opts.listenPort, reserved: Boolean(forwardOpts.domain) },
    'ngrok listener ready',
  );

  return {
    publicUrl,
    disconnect: async () => {
      await listener.close().catch(() => undefined);
      await ngrok.disconnect().catch(() => undefined);
      setTunnelPublicUrl(null);
      opts.log.info('ngrok disconnected');
    },
  };
}
