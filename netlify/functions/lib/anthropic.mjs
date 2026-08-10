const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';

// Resolves the AI Gateway credentials Netlify auto-injects into every
// Netlify Function once the site has had one production deploy — no
// Anthropic account or manual key needed. Usage is billed as Netlify
// credits on your Netlify plan, not as a separate Anthropic bill.
export function getCredentials() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  if (!apiKey) {
    throw new Error(
      "No Claude credentials found yet. This is expected before this site's first production deploy — Netlify's AI Gateway activates right after that, so deploy (or redeploy) once and try again. If you previously added your own ANTHROPIC_API_KEY environment variable, remove it — Netlify won't auto-inject the Gateway key while your own is set."
    );
  }

  return { apiKey, baseUrl };
}

// Opens a streaming call to Claude via the AI Gateway and returns the raw
// upstream Response so its body (a ReadableStream of SSE bytes) can be
// piped straight through to the browser. This matters here specifically:
// the system prompt is the full ~16k-token authored document, and a full
// Profile Card completion can take longer to generate than Netlify's
// synchronous function time limit (10s default / 26s on Pro) — streaming
// means the browser starts receiving tokens immediately instead of the
// function trying to buffer the whole reply before responding.
//
// The system prompt is marked with an ephemeral cache_control breakpoint,
// so turns after the first one in a session reuse the cached prompt
// (default 5-minute TTL) instead of reprocessing all ~16k tokens again —
// this alone meaningfully cuts latency turn-over-turn within a session.
export async function streamClaude(systemPrompt, messages, { maxTokens = 4096, temperature = 0.35 } = {}) {
  const { apiKey, baseUrl } = getCredentials();

  const upstream = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    throw new Error(`Anthropic API error (${upstream.status}): ${errText}`);
  }

  return upstream;
}

// If you set an ACCESS_CODE environment variable in Netlify, every request
// must include a matching code. Leave ACCESS_CODE unset to skip this gate
// entirely (fine for a small, semi-private link).
export function checkAccessCode(submittedCode) {
  const required = process.env.ACCESS_CODE;
  if (!required) return true;
  return typeof submittedCode === 'string' && submittedCode.trim() === required.trim();
}
