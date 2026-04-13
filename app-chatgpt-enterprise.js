// ChatGPT Apps proxy — enterprise OAuth on /oa2/* (enterprise-{slug}.jotform.pro), MCP on mcp-{slug}.
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND = process.env.BACKEND_BASE_URL;
if (!BACKEND) throw new Error('BACKEND_BASE_URL is not set.');
const NGROK_URL = process.env.NGROK_URL;
const ALWAYS_RETURN_200 = process.env.ALWAYS_RETURN_200 === 'true';
const FORWARD_RDS_ENV = process.env.FORWARD_RDS_ENV || 'enterprise';

/** @type {string} */
let ENTERPRISE_OAUTH_BASE;
if (process.env.ENTERPRISE_OAUTH_BASE_URL) {
  ENTERPRISE_OAUTH_BASE = process.env.ENTERPRISE_OAUTH_BASE_URL.replace(/\/$/, '');
} else {
  try {
    const u = new URL(BACKEND);
    if (!u.hostname.startsWith('mcp-')) {
      throw new Error(
        'BACKEND hostname must start with mcp- for auto enterprise host, or set ENTERPRISE_OAUTH_BASE_URL'
      );
    }
    u.hostname = u.hostname.replace(/^mcp-/, 'enterprise-');
    ENTERPRISE_OAUTH_BASE = u.origin;
  } catch (e) {
    throw new Error(`Enterprise OAuth base: ${e.message}`);
  }
}

app.use(express.raw({ type: '*/*' }));

function forwardHeaders(req) {
  const headers = { ...req.headers };
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  delete headers['host'];
  const publicHost = String(
    req.headers['x-forwarded-host'] || req.headers.host || ''
  )
    .split(',')[0]
    .trim();
  if (publicHost) {
    headers['x-forwarded-host'] = publicHost;
  }
  if (FORWARD_RDS_ENV) {
    headers['rds-env'] = FORWARD_RDS_ENV;
  }
  return headers;
}

function getResponseStatus(status) {
  return ALWAYS_RETURN_200 ? 200 : status;
}

/**
 * Normalize path+query for upstream (strip /chatgpt-app prefix).
 */
function stripChatgptAppPrefix(originalUrl) {
  const q = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
  let pathname = originalUrl.split('?')[0] || '/';
  pathname = pathname.replace(/\/chatgpt-app(\/|$)/, '/');
  return `${pathname}${q}`;
}

/** REST paths that must hit enterprise-{slug}.jotform.pro (not mcp-{slug}). */
const ENTERPRISE_API_PREFIXES = ['/API/nexus', '/API/user', '/API/share'];

function isEnterpriseAppApiPath(originalUrl) {
  const pathOnly = stripChatgptAppPrefix(originalUrl).split('?')[0] || '/';
  return ENTERPRISE_API_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
}

/**
 * Paths that must hit enterprise host under /oa2/ (not oauth2- vhost).
 */
function isEnterpriseOAuthProxyPath(originalUrl) {
  const pathOnly = originalUrl.split('?')[0] || '';
  const p = pathOnly.replace(/\/chatgpt-app(\/|$)/, '/');
  return (
    p.includes('oauth-authorization-server') ||
    p.includes('oauth2') ||
    p.includes('/oa2') ||
    p.includes('token') ||
    p.includes('register-public-client') ||
    p.includes('authorize')
  );
}

/**
 * Map incoming path to enterprise /oa2/ path; preserve query string.
 */
function toEnterpriseOa2Path(originalUrl) {
  const q = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
  let pathname = originalUrl.split('?')[0] || '/';
  pathname = pathname.replace(/\/chatgpt-app(\/|$)/, '/');

  if (pathname.startsWith('/oa2/') || pathname === '/oa2') {
    return `${pathname}${q}`;
  }

  const short = {
    '/token': '/oa2/token',
    '/authorize': '/oa2/authorize',
    '/register-public-client': '/oa2/register-public-client',
  };
  if (short[pathname]) {
    return `${short[pathname]}${q}`;
  }

  if (pathname.includes('oauth2')) {
    const rest = pathname.replace(/^\/oauth2/, '').replace(/^\//, '');
    return `/oa2/${rest}${q}`;
  }

  return `${pathname}${q}`;
}

function buildUpstreamUrl(originalUrl) {
  if (isEnterpriseOAuthProxyPath(originalUrl)) {
    const pathAndQuery = toEnterpriseOa2Path(originalUrl);
    return `${ENTERPRISE_OAUTH_BASE}${pathAndQuery}`;
  }
  if (isEnterpriseAppApiPath(originalUrl)) {
    return `${ENTERPRISE_OAUTH_BASE}${stripChatgptAppPrefix(originalUrl)}`;
  }
  return `${BACKEND}${originalUrl}`;
}

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function applyUpstreamResponseHeaders(res, headers) {
  if (!headers || typeof headers !== 'object') {
    return;
  }
  for (const key of Object.keys(headers)) {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    try {
      const value = headers[key];
      if (value !== undefined) {
        res.set(key, value);
      }
    } catch (_) {
      // ignore invalid header names from axios
    }
  }
}

function summarizeBodyForLog(data, maxLen = 400) {
  if (data == null) {
    return '(empty)';
  }
  if (Buffer.isBuffer(data)) {
    const s = data.toString('utf8');
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  }
  if (typeof data === 'string') {
    return data.length > maxLen ? `${data.slice(0, maxLen)}…` : data;
  }
  try {
    const s = JSON.stringify(data);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return '(unserializable)';
  }
}

async function proxyHttp(req, res, method) {
  const url = buildUpstreamUrl(req.originalUrl);
  const publicHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const started = Date.now();
  console.log(
    `[chatgpt-enterprise] → ${method.toUpperCase()} ${url} (from ${req.originalUrl}, publicHost=${publicHost || 'n/a'}, content-type=${req.headers['content-type'] || 'n/a'})`
  );
  try {
    const response = await axios({
      method,
      url,
      data: method === 'post' ? req.body : undefined,
      headers: forwardHeaders(req),
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });
    const ms = Date.now() - started;
    const bodyPreview = summarizeBodyForLog(response.data);
    console.log(
      `[chatgpt-enterprise] ← ${method.toUpperCase()} status=${response.status} ${ms}ms ${url} bodyPreview=${bodyPreview.replace(/\s+/g, ' ')}`
    );
    res.status(getResponseStatus(response.status));
    applyUpstreamResponseHeaders(res, response.headers);
    res.send(response.data);
  } catch (e) {
    const ms = Date.now() - started;
    const errMsg = e.message || String(e);
    const code = e.code || '';
    console.error(
      `[chatgpt-enterprise] ✗ ${method.toUpperCase()} ${ms}ms ${url} error=${errMsg} code=${code}`
    );
    const status = e.response?.status ?? 502;
    res.status(getResponseStatus(status));
    applyUpstreamResponseHeaders(res, e.response?.headers);
    res.send(e.response?.data ?? `Upstream error: ${errMsg}`);
  }
}

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const baseUrl = (NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(
    /\/$/,
    ''
  );
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: [],
    bearer_methods_supported: ['header'],
  });
});

app.get('/.well-known/oauth-protected-resource/*', (req, res) => {
  const baseUrl = (NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(
    /\/$/,
    ''
  );
  const resourcePath = req.params[0] || '';
  res.json({
    resource: `${baseUrl}/${resourcePath}`,
    authorization_servers: [baseUrl],
    scopes_supported: [],
    bearer_methods_supported: ['header'],
  });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = (NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(
    /\/$/,
    ''
  );
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oa2/authorize`,
    token_endpoint: `${baseUrl}/oa2/token`,
    registration_endpoint: `${baseUrl}/oa2/register-public-client`,
    scopes_supported: [],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
  });
});

app.options('*', (req, res) => proxyHttp(req, res, 'options'));
app.post('*', (req, res) => proxyHttp(req, res, 'post'));
app.get('*', (req, res) => proxyHttp(req, res, 'get'));

app.listen(PORT, () => {
  console.log(`ChatGPT enterprise proxy on :${PORT}`);
  console.log(`  MCP (other API, non-OAuth) → ${BACKEND}`);
  console.log(
    `  ${ENTERPRISE_API_PREFIXES.join(', ')}/* + OAuth → ${ENTERPRISE_OAUTH_BASE} (.../oa2/... for OAuth)`
  );
});
