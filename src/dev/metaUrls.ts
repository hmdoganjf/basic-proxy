/**
 * Paths under the proxy (after `/<jotform-username>/<channel>/`) that match
 * `api/v1/endpoints/ai-agent-meta-channels.router.php` webhook entrypoints.
 * Backend is mounted with an `API/` prefix on RDS hosts.
 */
export const META_WEBHOOK_PATHS = [
  'API/ai-agent-builder/webhook',
  'API/ai-agent-builder/instagram/webhook',
] as const;

export interface ParsedDevCli {
  printMetaUrls: boolean;
  /** Jotform usernames for URL path (comma-separated on CLI). */
  metaUsernames: string[];
  /** argv with dev-only flags removed (pass to {@link AppEnv.load}). */
  argvForAppEnv: string[];
}

export function parseDevCli(argv: string[]): ParsedDevCli {
  const argvForAppEnv: string[] = [];
  let printMetaUrls = false;
  const metaUsernames: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--out-meta-urls') {
      printMetaUrls = true;
      continue;
    }
    if (a.startsWith('--username=')) {
      const rest = a.slice('--username='.length);
      for (const part of rest.split(',')) {
        const t = part.trim();
        if (t) {
          metaUsernames.push(t);
        }
      }
      continue;
    }
    if (a === '--username') {
      const next = argv[i + 1];
      if (next !== undefined) {
        i++;
        for (const part of next.split(',')) {
          const t = part.trim();
          if (t) {
            metaUsernames.push(t);
          }
        }
      }
      continue;
    }
    argvForAppEnv.push(a);
  }

  return {
    printMetaUrls,
    metaUsernames: [...new Set(metaUsernames)],
    argvForAppEnv,
  };
}

function joinProxyUrl(
  publicBase: string,
  pathUsername: string,
  channelKey: string,
  tail: string,
): string {
  const b = publicBase.replace(/\/+$/, '');
  const u = pathUsername.replace(/^\/+|\/+$/g, '');
  const c = channelKey.replace(/^\/+|\/+$/g, '');
  const t = tail.replace(/^\/+/, '');
  return `${b}/${u}/${c}/${t}`;
}

/** OSC 8 hyperlink (clickable in many terminals). */
function linkify(url: string): string {
  if (!process.stdout.isTTY) {
    return url;
  }
  return `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\`;
}

export function printMetaWebhookUrls(opts: {
  publicBase: string;
  pathUsernames: string[];
  channelKey: string;
}): void {
  const { publicBase, pathUsernames, channelKey } = opts;
  if (pathUsernames.length === 0) {
    return;
  }
  console.log('\n── Meta webhook URLs (copy / cmd+click) ──');
  pathUsernames.forEach((user, idx) => {
    for (const path of META_WEBHOOK_PATHS) {
      console.log(linkify(joinProxyUrl(publicBase, user, channelKey, path)));
    }
    if (idx < pathUsernames.length - 1) {
      console.log('');
    }
  });
  console.log('────────────────────────────────────────\n');
}
