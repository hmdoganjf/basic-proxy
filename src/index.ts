import type { Server } from 'node:http';
import { AppEnv } from './env/AppEnv.js';
import { loadRootConfig } from './config/loadRootConfig.js';
import type { RootConfig, UserBlock } from './config/types.js';
import { createApp } from './proxy/createApp.js';
import { createRootLogger } from './logger.js';
import { startEmbeddedNgrok } from './ngrok/startTunnel.js';
import { discoverReservedNgrokHostname, mergeExplicitNgrokDomain } from './ngrok/discoverReservedHostname.js';
import { parseDevCli, printMetaWebhookUrls } from './dev/metaUrls.js';

function readNgrokAuthtoken(root: RootConfig, env: NodeJS.ProcessEnv): string | undefined {
  const raw = root.ngrok_token;
  const fromFile = typeof raw === 'string' ? raw.trim() : '';
  if (fromFile) {
    return fromFile;
  }
  return env.NGROK_AUTHTOKEN?.trim();
}

function pickExampleChannel(root: RootConfig, profileKey: string): string | null {
  const ub = root[profileKey];
  if (!ub || typeof ub !== 'object') {
    return null;
  }
  const channels = (ub as UserBlock).channels;
  if (!channels || typeof channels !== 'object') {
    return null;
  }
  if ('instagram' in channels) {
    return 'instagram';
  }
  const keys = Object.keys(channels).filter((k) => !k.startsWith('_'));
  return keys[0] ?? null;
}

function samplePathUsername(root: RootConfig, env: NodeJS.ProcessEnv): string {
  return (
    env.JOTFORM_USERNAME?.trim() ||
    (typeof root.jotform_username === 'string' ? root.jotform_username.trim() : '') ||
    '<jotform-username>'
  );
}

async function main(): Promise<void> {
  const { printMetaUrls, metaUsernames, argvForAppEnv } = parseDevCli(process.argv);
  const appEnv = AppEnv.load(argvForAppEnv);
  const root = loadRootConfig(appEnv.configPath);
  const ngrokToken = readNgrokAuthtoken(root, process.env);

  if (!appEnv.ngrokDisabled && !ngrokToken) {
    console.error(
      'Missing ngrok authtoken: set `ngrok_token` in config.json (root) or export NGROK_AUTHTOKEN. Or set PROXY_NGROK_DISABLED=1 for local-only HTTP.',
    );
    process.exit(1);
  }

  const log = createRootLogger({ level: appEnv.logLevel, pretty: appEnv.logPretty });
  const app = createApp(root, log, { profileKey: appEnv.tunnelUser });
  const port = appEnv.listenPort(root);

  let tunnelDisconnect: (() => Promise<void>) | null = null;

  const server: Server = app.listen(port, async () => {
    log.info({ port }, 'HTTP listening');

    try {
      const explicitDomain = mergeExplicitNgrokDomain(root, appEnv.ngrokReservedDomain);
      const reservedDomain = await discoverReservedNgrokHostname({
        explicit: explicitDomain,
        env: process.env,
        log,
      });
      const tunnel = await startEmbeddedNgrok({
        listenPort: port,
        reservedDomain,
        ngrokDisabled: appEnv.ngrokDisabled,
        authtoken: ngrokToken ?? null,
        log,
      });
      tunnelDisconnect = tunnel?.disconnect ?? null;

      const base = (tunnel?.publicUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '');
      const pathUser = samplePathUsername(root, process.env);
      const exampleCh = pickExampleChannel(root, appEnv.tunnelUser) || 'instagram-facebook';
      const sample = `${base}/${pathUser}/${exampleCh}/…`;

      log.warn(
        {
          sample,
          profileKey: appEnv.tunnelUser,
          hint: 'URL path is /<jotform-username>/<channel>/… (username not in config). Channels come from profile PROXY_TUNNEL_USER or the only profile block.',
        },
        'webhook / public URL pattern',
      );

      if (printMetaUrls) {
        let pathUsers = metaUsernames;
        if (pathUsers.length === 0) {
          const fallback = samplePathUsername(root, process.env);
          if (fallback && fallback !== '<jotform-username>') {
            pathUsers = [fallback];
          }
        }
        if (pathUsers.length > 0) {
          printMetaWebhookUrls({
            publicBase: base,
            pathUsernames: pathUsers,
            channelKey: exampleCh,
          });
        } else if (printMetaUrls) {
          log.warn('Use --username=alice or --username=alice,bob (or set JOTFORM_USERNAME / jotform_username) to print Meta URLs.');
        }
      }
    } catch (e) {
      log.fatal({ err: e }, 'ngrok failed');
      process.exit(1);
    }
  });

  const shutdown = async (): Promise<void> => {
    await tunnelDisconnect?.();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void shutdown().then(() => process.exit(0));
    });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
