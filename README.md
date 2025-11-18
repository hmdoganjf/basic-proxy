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
you can use any package manager you want (npm, pnpm, yarn)
- `pnpm i`
- Copy `config.json.example` to `config.json`:
  ```bash
  cp config.json.example config.json
  ```
- Configure your user and usecase settings in `config.json`

# Configuration

The proxy supports multiple users and usecases. 

**Important:** You must copy `config.json.example` to `config.json` and add your own configuration.

Edit `config.json` to add your username, apps, and URLs:

```json
{
  "your-username": {
    "instagram": {
      "BACKEND_BASE_URL": "https://your-backend.jotform.pro",
      "NGROK_URL": "https://your-ngrok-domain.ngrok-free.app"
    },
    "chatgpt": {
      "BACKEND_BASE_URL": "https://mcp-your-backend.jotform.pro",
      "NGROK_URL": "https://your-ngrok-domain.ngrok-free.app"
    }
  }
}
```

# Running the proxy

The script accepts two arguments: `user` and `usecase`.

Usage:
```bash
./start.sh <user> <usecase>
```

Examples:
```bash
# For instagram usecase
./start.sh ock instagram

# For chatgpt-apps usecase
./start.sh ock chatgpt

# For hami user
./start.sh hami instagram
./start.sh hami chatgpt
```

Supported usecases:
- `instagram` - for Instagram agent proxy
- `chatgpt` - for ChatGPT apps proxy

The script will:
1. Load configuration from `config.json` based on user and usecase
2. Start a tmux session with two panes
3. Run the proxy server in the left pane
4. Run ngrok in the right pane

Optional: You can still use `.env` file for `PORT` and `ALWAYS_RETURN_200` settings. These will be used as defaults if not specified in the config.