# basic-proxy
Very basic proxy for some server you can reach from your local but not from public by using your local as a proxy.

Uses [ngrok](https://ngrok.com/) to make your local public, and redirects your port to your private server.

# Prerequisites
- ngrok installed on your computer (you can run `brew install ngrok` in macOS) 
- a constant ngrok domain (can be obtained freely from ngrok)
- node
- any node package manager (npm, pnpm, yarn)
- tmux (you can run `brew install tmux` in macOS)

# Getting Started 
- `pnpm i`
- `cp config.json.example config.json` and edit. **All** settings (URLs, `PORT`, `ALWAYS_RETURN_200`, per user/use case) are in this file only. No `.env` with duplicate keys.

# Configuration

Root of `config.json` (optional, defaults: port `3000`, `ALWAYS_RETURN_200` false):

- `PORT` — local listen port
- `ALWAYS_RETURN_200` — chatgpt use case only, maps upstream error statuses to 200

Then each key like `ock` / `hami` is a user, with `instagram` and `chatgpt` blocks containing `BACKEND_BASE_URL` and `NGROK_URL`. See `config.json.example`.

**Without `./start.sh`:** run the app with the same `config.json` and:

```bash
BASIC_PROXY_USER=ock BASIC_PROXY_USECASE=chatgpt node app-chatgpt.js
```

(Use `BASIC_PROXY_USECASE=instagram` and `app-instagram.js` for the other app.) Environment variables still **override** values from the file for one-off runs.

# Running the proxy

The script accepts two arguments: `user` and `usecase` (match keys under `config.json`).

```bash
./start.sh <user> <usecase>
```

Examples:

```bash
./start.sh ock instagram
./start.sh ock chatgpt
./start.sh hami instagram
./start.sh hami chatgpt
```

- `instagram` — Instagram agent proxy
- `chatgpt` — ChatGPT apps proxy

The script will:
1. Read `config.json` for the chosen user and use case, plus `PORT` / `ALWAYS_RETURN_200` at the root
2. Start a tmux session with two panes
3. Run the proxy server in the left pane
4. Run ngrok in the right pane
