import { SYSTEM_PROMPT } from './lib/system-prompt.mjs';
import { streamClaude, checkAccessCode } from './lib/anthropic.mjs';

// Safety cap so an unusually long session can't grow the request without bound.
// A full 8-scenario session plus reflection comfortably fits well inside this.
const MAX_HISTORY_MESSAGES = 80;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { code, messages } = body || {};

  if (!checkAccessCode(code)) {
    return new Response(JSON.stringify({ error: 'Incorrect or missing class code.' }), { status: 401 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing conversation history.' }), { status: 400 });
  }

  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? ''),
  }));

  try {
    const upstream = await streamClaude(SYSTEM_PROMPT, trimmed, { maxTokens: 4096, temperature: 0.35 });

    // Pass Claude's SSE stream straight through to the browser — the
    // client (public/app.js) parses content_block_delta events itself.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
