# basic-proxy

TypeScript dev proxy: Express listens locally, **embedded ngrok** exposes a public URL, traffic is routed as:

`https://<tunnel>/<jotform-username>/<channelKey>/<path>`

The first path segment is your **Jotform / RDS username** (for `https://<username>.jotform.pro` and `${#username}`). It does **not** have to match a key in `config.json`. Channel definitions come from a **profile** block: set `PROXY_TUNNEL_USER` to that key, or keep a single profile in the file.

## Prerequisites

- Node 20+ and pnpm

## Quick start

```bash
pnpm install
cp config.json.example config.json
# Edit config: add root `ngrok_token` (or export NGROK_AUTHTOKEN), define at least one profile with `channels`.
pnpm run dev
```

Scripts:

| Command | Purpose |
|--------|---------|
| `pnpm run dev` | Run once (prints sample public URL) |
| `pnpm run dev -- --out-meta-urls --username=<jotform-user>` | After ngrok is up, prints copy-ready Meta webhook URLs (OSC 8 links in a TTY). Comma-separate multiple users: `--username=alice,bob`. Omit `--username` to use `JOTFORM_USERNAME` or root `jotform_username`. Use `--` so pnpm forwards flags to the script. |
| `pnpm run start:dev` | Same as `dev` (alias) |
| `pnpm run dev:watch` | `tsx watch` for local iteration |
| `pnpm run build` | Emit `dist/` |
| `pnpm start` | `node dist/index.js` (run `build` first) |

## `config.json`

**Root (reserved keys, not profile names):**

| Field | Purpose |
|-------|---------|
| `PORT` | Local listen port (default 3000) |
| `ALWAYS_RETURN_200` | Map upstream errors to 200 (ChatGPT-style) |
| `ngrok_token` | ngrok authtoken (or use env `NGROK_AUTHTOKEN`) |
| `ngrok_domain` | Optional explicit hostname; overridden by `NGROK_DOMAIN` / `PROXY_NGROK_DOMAIN` |
| `jotform_username` | Optional; used only in the startup log example |
| `_comment` | Ignored |

**Per profile** (`<profileKey>` in JSON, e.g. `default`): `{ "channels": { "<channelKey>": { … } } }`

- `BACKEND_BASE_URL` — optional override for upstream base.
- `kind` — `"instagram"` \| `"chatgpt"` (also inferred from channel name `chatgpt`).
- `headers` — nested object → flattened `X-Proxy-Config-*` headers; supports `${#username}`, `${#channel}`, `${#ngrok_url}` (from path + live tunnel) and `${backend_url}` (resolved upstream).

### ngrok static hostname without duplicating it here

The tunnel **authtoken** (`ngrok_token` / `NGROK_AUTHTOKEN`) is only for the agent session; ngrok does **not** expose “list my reserved domains” from that token.

If you omit `ngrok_domain`, the app tries in order:

1. **`NGROK_API_KEY`** (or `api_key` in your ngrok agent `ngrok.yml`) → ngrok REST API `GET /reserved_domains` (first suitable `*.ngrok-free.app` / `*.ngrok.app` style host).
2. **`domain` / `hostname`** in the agent config file (same paths the CLI uses, e.g. `~/.config/ngrok/ngrok.yml`, macOS `~/Library/Application Support/ngrok/ngrok.yml`, or `NGROK_CONFIG_PATH`).

Create an API key under [ngrok API keys](https://dashboard.ngrok.com/api-keys) and `export NGROK_API_KEY=...`, or rely on a `domain:` line you already set for `ngrok http --domain=…`.

**Env:**

| Variable | Purpose |
|----------|---------|
| `PROXY_LOG_LEVEL` | pino level (default `info`) |
| `PROXY_LOG_PRETTY` | `0`/`false` to disable pretty logs; when unset, pretty is **on** in a TTY and **off** when `CI=1` |
| `PROXY_TUNNEL_USER` | Profile key whose `channels` to use when several profiles exist (must match a JSON object key) |
| `PROXY_NGROK_DISABLED` | `1` / `true` — skip ngrok |
| `NGROK_DOMAIN` / `PROXY_NGROK_DOMAIN` | Reserved ngrok hostname (wins over `ngrok_domain` in JSON) |
| `NGROK_API_KEY` | REST API key — used to discover a reserved hostname when not set explicitly |
| `NGROK_CONFIG_PATH` | Path to `ngrok.yml` if not in the default locations |
| `PROXY_RDS_HOST_SUFFIX` | Default `jotform.pro` for inferred upstream host |
| `BACKEND_BASE_URL` | Global upstream override (optional) |
| `JOTFORM_USERNAME` | Overrides first path segment in startup example log |

## App-specific routes

Under `src/apps/`, each `ProxyKind` can register routes that run **before** the default axios proxy (e.g. ChatGPT `/.well-known/...`). See `src/apps/types.ts` and `src/apps/registry.ts`.
