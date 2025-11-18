// proxy.js
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND = process.env.BACKEND_BASE_URL;
if (!BACKEND) throw new Error('BACKEND_BASE_URL is not set.');

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
    res.status(response.status).set(response.headers).send(response.data);
  } catch (e) {
    const status = e.response?.status ?? 502;
    res.status(status).send(e.response?.data ?? 'Upstream error');
  }
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("*", async (req, res) => {
  let status;
  let data;
  try {
    const response = await axios.get(`${BACKEND}${req.originalUrl}`)
    status = response.status;
    data = response.data;
  } catch (e) {
    status = e.response.status;
    data = e.response.data;
  } finally {
    res.status(status).send(data.content);
  }
});

app.listen(PORT, () => console.log(`Proxy on :${PORT}`));