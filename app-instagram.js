// proxy.js
const express = require('express');
const axios = require('axios');
const { get } = require('./proxy-config.cjs');

const app = express();
const { port: PORT, backend: BACKEND } = get();

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

app.post('*', async (req, res) => {
  try {
    const response = await axios({
      method: 'post',
      url: `${BACKEND}${req.originalUrl}`,
      // forward the original raw bytes exactly
      data: req.body, // Buffer from express.raw
      headers: forwardHeaders(req),
      // prevent axios from changing the body
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });
    res.status(response.status).set(response.headers).send(typeof response.data === 'number' ? String(response.data) : response.data);
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(status).send(e.response?.data ?? 'Upstream error');
  }
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("*", async (req, res) => {
  try {
    const response = await axios({
      method: 'get',
      url: `${BACKEND}${req.originalUrl}`,
      headers: forwardHeaders(req),
      validateStatus: () => true,
      maxRedirects: 0,
    });

    // RDS wraps GET responses in { content, responseCode }; unwrap unless it's a redirect.
    const isRedirect = response.status >= 300 && response.status < 400;
    const data = response.data;
    if (!isRedirect && data && typeof data === 'object' && 'content' in data) {
      res.status(response.status).send(String(data.content));
    } else {
      res.status(response.status).set(response.headers).send(typeof data === 'number' ? String(data) : data);
    }
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(status).send(e.response?.data ?? 'Upstream error');
  }
});

app.listen(PORT, () => console.log(`Proxy on :${PORT}`));
