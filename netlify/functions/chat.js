const fetch = require('node-fetch');

// Netlify serverless function that proxies chat messages to a Gemini endpoint.
// REQUIRED Netlify env vars:
// - GEMINI_ENDPOINT (the provider endpoint URL)
// - GEMINI_API_KEY  (your API key)
//
// NOTE: This is a simple example. If your Gemini provider requires a different
// request shape, tell me which provider/endpoint and I will adapt it.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Very small safety guard: prevent very large requests
  const totalChars = messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
  if (totalChars > 4000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Messages too long (reduce conversation length)' }) };
  }

  const endpoint = process.env.GEMINI_ENDPOINT;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!endpoint || !apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: missing GEMINI_ENDPOINT or GEMINI_API_KEY' }) };
  }

  try {
    // Adjust the request body here if your provider needs a different format.
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: { messages } }),
      timeout: 60000
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream error', status: resp.status, details: txt }) };
    }

    const data = await resp.json();

    // Attempt to extract readable response text (provider-specific).
    const reply =
      (data.output && data.output[0] && data.output[0].content && data.output[0].content[0] && data.output[0].content[0].text) ||
      data.output?.text ||
      data?.result ||
      JSON.stringify(data);

    return { statusCode: 200, body: JSON.stringify({ reply, raw: data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error', message: err.message }) };
  }
};
