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

// Calls Claude via the AI Gateway with streaming on, and returns a plain
// ReadableStream of decoded text — just the reply's characters, in order,
// with no envelope around them. All the SSE parsing (event/data lines,
// JSON frames, event types) happens once, here, in a single well-defined
// place, instead of being re-implemented in browser JS where it would be
// the least tested, most failure-prone part of the app. The client just
// reads bytes and appends them; nothing there can misparse a frame.
//
// Streaming is still what's happening under the hood — the browser starts
// receiving text immediately rather than the function buffering a whole
// reply before responding, which matters because Netlify's synchronous
// function time limit (10s default / 26s on Pro) can be shorter than a
// full coaching-block completion takes to generate.
//
// The system prompt carries an ephemeral cache_control breakpoint, so
// turns after the first one in a session reuse the cached prompt (default
// 5-minute TTL) instead of reprocessing it from scratch.
export async function streamClaudeText(systemPrompt, messages, { maxTokens = 4096, temperature = 0.35 } = {}) {
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

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const evt of events) {
        const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;

        const jsonStr = dataLine.slice(5).trim();
        if (!jsonStr) continue;

        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          controller.enqueue(encoder.encode(parsed.delta.text));
        } else if (parsed.type === 'error') {
          controller.error(new Error(parsed.error?.message || 'Streaming error'));
          return;
        }
      }
    },
  });
}

// If you set an ACCESS_CODE environment variable in Netlify, every request
// must include a matching code. Leave ACCESS_CODE unset to skip this gate
// entirely (fine for a small, semi-private link).
export function checkAccessCode(submittedCode) {
  const required = process.env.ACCESS_CODE;
  if (!required) return true;
  return typeof submittedCode === 'string' && submittedCode.trim() === required.trim();
}
