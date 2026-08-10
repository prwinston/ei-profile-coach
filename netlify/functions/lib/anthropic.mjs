const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';

// Calls Claude via Netlify's AI Gateway and returns the raw reply text.
// Netlify auto-injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL into every
// Netlify Function once the site has had one production deploy — no
// Anthropic account or manual key needed. Usage is billed as Netlify
// credits on your Netlify plan, not as a separate Anthropic bill.
export async function callClaude(system, messages, { maxTokens = 4096, temperature = 0.35 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  if (!apiKey) {
    throw new Error(
      "No Claude credentials found yet. This is expected before this site's first production deploy — Netlify's AI Gateway activates right after that, so deploy (or redeploy) once and try again. If you previously added your own ANTHROPIC_API_KEY environment variable, remove it — Netlify won't auto-inject the Gateway key while your own is set."
    );
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
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
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text response received from the model.');
  return textBlock.text;
}

// If you set an ACCESS_CODE environment variable in Netlify, every request
// must include a matching code. Leave ACCESS_CODE unset to skip this gate
// entirely (fine for a small, semi-private link).
export function checkAccessCode(submittedCode) {
  const required = process.env.ACCESS_CODE;
  if (!required) return true;
  return typeof submittedCode === 'string' && submittedCode.trim() === required.trim();
}
