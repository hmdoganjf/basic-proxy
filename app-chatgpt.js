// proxy.js - ChatGPT Apps version
const express = require('express');
const axios = require('axios');
const { get } = require('./proxy-config.cjs');

const app = express();
const { port: PORT, backend: BACKEND, mcpBaseUrl: MCP_BACKEND, ngrok: NGROK_URL, alwaysReturn200: ALWAYS_RETURN_200 } = get();
const PROXY_BACKEND = MCP_BACKEND || BACKEND;
const OAUTH_BACKEND = PROXY_BACKEND.replace('mcp-', 'oauth2-');
// IMPORTANT: capture raw body (do NOT use express.json())
app.use(express.raw({ type: '*/*' }));
function forwardHeaders(req) {
  // clone incoming headers and drop hop-by-hop/unsafe ones
  const headers = { ...req.headers };
  // These should be set by axios based on the data we send
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  // Avoid forwarding the proxy's host
  delete headers['host'];
  return headers;
}
function getResponseStatus(status) {
  return ALWAYS_RETURN_200 ? 200 : status;
}

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const baseUrl = NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: [],
    bearer_methods_supported: ['header'],
  });
});

app.get('/.well-known/oauth-protected-resource/*', (req, res) => {
  const baseUrl = NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const resourcePath = req.params[0] || '';
  res.json({
    resource: `${baseUrl}/${resourcePath}`,
    authorization_servers: [baseUrl],
    scopes_supported: [],
    bearer_methods_supported: ['header'],
  });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = NGROK_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${OAUTH_BACKEND}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register-public-client`,
    scopes_supported: [],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
  });
});

app.options('*', async (req, res) => {
  try {
    let url;

    if (req.originalUrl.includes('oauth-authorization-server') || 
      req.originalUrl.includes('oauth2') || 
      req.originalUrl.includes('token') || 
      req.originalUrl.includes('register-public-client') ||
      req.originalUrl.includes('authorize')) {
      url = `${OAUTH_BACKEND}${req.originalUrl}`;
      url = url.replace('/chatgpt-app', '');
    } else {
      url = `${PROXY_BACKEND}${req.originalUrl}`;
    }

    const response = await axios({
      method: 'options',
      url: url,
      headers: forwardHeaders(req),
      validateStatus: () => true,
    });
    console.log(`Forwarding OPTIONS [chatgpt] request to: ${url} (${req.originalUrl})`);
    res.status(getResponseStatus(response.status)).set(response.headers).send(response.data);
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(getResponseStatus(status)).set(e.response?.headers ?? {}).send(e.response?.data ?? 'Upstream error');
  }
});
app.post('*', async (req, res) => {
  try {
    let url;

    if (req.originalUrl.includes('oauth-authorization-server') || 
      req.originalUrl.includes('oauth2') || 
      req.originalUrl.includes('token') || 
      req.originalUrl.includes('register-public-client') ||
      req.originalUrl.includes('authorize')) {
      url = `${OAUTH_BACKEND}${req.originalUrl}`;
      url = url.replace('/chatgpt-app', '');
    } else {
      url = `${PROXY_BACKEND}${req.originalUrl}`;
    }

    console.log(`Forwarding POST [chatgpt] request to: ${url} from (${req.originalUrl})`);
    const response = await axios({
      method: 'post',
      url: url || `${PROXY_BACKEND}${req.originalUrl}`,
      // forward the original raw bytes exactly
      data: req.body, // Buffer from express.raw
      headers: forwardHeaders(req),
      // prevent axios from changing the body
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });
    res.status(getResponseStatus(response.status)).set(response.headers).send(response.data);
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(getResponseStatus(status)).set(e.response?.headers ?? {}).send(e.response?.data ?? 'Upstream error');
  }
});

app.get("*", async (req, res) => {
  try {
    let url;

    if (req.originalUrl.includes('oauth-authorization-server') || 
      req.originalUrl.includes('oauth2') || 
      req.originalUrl.includes('token') || 
      req.originalUrl.includes('register-public-client') ||
      req.originalUrl.includes('authorize')) {
      url = `${OAUTH_BACKEND}${req.originalUrl}`;
      url = url.replace('/chatgpt-app', '');
    } else {
      url = `${PROXY_BACKEND}${req.originalUrl}`;
    }

    url = url.replace('/chatgpt', '');
    console.log(`Forwarding GET [chatgpt] request to: ${url} from (${req.originalUrl})`);
    const response = await axios({
      method: 'get',
      url: url || `${PROXY_BACKEND}${req.originalUrl}`,
      headers: forwardHeaders(req),
      validateStatus: () => true,
    });
    res.status(getResponseStatus(response.status)).set(response.headers).send(response.data);
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(getResponseStatus(status)).set(e.response?.headers ?? {}).send(e.response?.data ?? 'Upstream error');
  }
});
app.listen(PORT, () => console.log(`ChatGPT Apps Proxy on :${PORT}`));