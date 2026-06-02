const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Resolution order: config.json (per user/usecase + root defaults) → env vars override.
function get() {
  const env = process.env;
  let fromFile = {};

  if (fs.existsSync(CONFIG_PATH)) {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const u = env.BASIC_PROXY_USER;
    const uc = env.BASIC_PROXY_USECASE;
    if (u && uc) {
      const b = c[u] && c[u][uc];
      if (!b || !b.BACKEND_BASE_URL) {
        throw new Error(`${CONFIG_PATH}: missing BACKEND_BASE_URL at ["${u}"]["${uc}"]`);
      }
      fromFile = { backend: b.BACKEND_BASE_URL, mcpBaseUrl: b.MCP_BASE_URL, ngrok: b.NGROK_URL };
    }
    const filePort = Number(c.PORT);
    if (Number.isFinite(filePort) && filePort > 0) fromFile.port = filePort;
    if (c.ALWAYS_RETURN_200 !== undefined) {
      fromFile.alwaysReturn200 = c.ALWAYS_RETURN_200 === true || String(c.ALWAYS_RETURN_200).toLowerCase() === 'true';
    }
  }

  const envPort = Number(env.PORT);
  const out = {
    backend: env.BACKEND_BASE_URL || fromFile.backend,
    mcpBaseUrl: env.MCP_BASE_URL || fromFile.mcpBaseUrl,
    ngrok: env.NGROK_URL || fromFile.ngrok,
    port: Number.isFinite(envPort) && envPort > 0 ? envPort : (fromFile.port || 3000),
    alwaysReturn200:
      env.ALWAYS_RETURN_200 !== undefined ? env.ALWAYS_RETURN_200 === 'true' : (fromFile.alwaysReturn200 || false),
  };

  if (!out.backend) {
    throw new Error(
      `BACKEND_BASE_URL not set. Either run ./start.sh, set BASIC_PROXY_USER + BASIC_PROXY_USECASE so ${CONFIG_PATH} can be read, or export BACKEND_BASE_URL directly.`
    );
  }
  return out;
}

module.exports = { get };
