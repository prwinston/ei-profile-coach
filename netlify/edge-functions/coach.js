// EI Profile Coach — development brief generator
//
// This runs as a Netlify EDGE function, not a standard serverless function.
// That is deliberate. Standard functions are killed at 10 seconds, and a
// Sonnet call that writes a full structured brief regularly takes longer.
// Edge functions only need to return response HEADERS within 40 seconds and
// can then keep writing to the stream, so we open the response immediately
// and push the JSON in once the model has finished.
//
// The AI Gateway injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL into edge
// functions automatically. Nothing to configure, no key in the browser.

const MODEL = "claude-sonnet-4-5";
const UPSTREAM_TIMEOUT_MS = 35000;

const DOMAIN_NAMES = {
  awareness: "Self-Awareness",
  regulation: "Self-Regulation",
  empathy: "Empathy",
  social: "Social Skills",
};

function readEnv(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env) {
      const v = Netlify.env.get(name);
      if (v) return v;
    }
  } catch (_) { /* not available in this context */ }
  try {
    if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name);
  } catch (_) { /* not available in this context */ }
  return undefined;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const SYSTEM = `You are an executive coach working with investment professionals — portfolio managers, analysts, relationship managers. You are writing a one-page development brief that will be printed and handed to a participant in a live workshop.

Your reader is numerate, time-poor, and sceptical of soft-skills language. They respect precision and specificity. They will disregard anything that sounds like a horoscope.

Rules:
- Never flatter. Name the pattern plainly, including what it costs them.
- Quote back their actual choices. Specificity is what makes this credible.
- Every practice must be something they can do inside a normal working week on a desk. No journalling prompts, no "practice mindfulness", no retreats.
- Use their world: morning meetings, drawdowns, IC papers, client calls, attribution, risk reviews.
- British-neutral professional English. No em dashes. No exclamation marks.

Return ONLY valid JSON. No markdown fences, no preamble.

Schema:
{
  "headline": "One sentence, max 14 words, naming the specific pattern.",
  "read": "3 to 4 sentences. What their pattern of choices suggests, and what it likely costs them at work. Direct, not harsh.",
  "evidence": ["2 short items. Each references a specific choice they made and what it revealed."],
  "practices": [
    {"title": "3-5 words, imperative", "what": "2 sentences on exactly what to do", "when": "The specific recurring moment to attach it to"}
  ],
  "conversation": "One sentence they could actually say out loud this week, in quotation marks, that would stretch this domain.",
  "watch_for": "One sentence naming the derailer — how this development effort typically goes wrong."
}

Exactly 3 practices. Exactly 2 evidence items.`;

function buildUserPrompt(focus, scores, responses) {
  const transcript = responses
    .map(
      (r, i) =>
        `${i + 1}. ${r.situation}\n   Chose: "${r.choice}"\n   (${
          DOMAIN_NAMES[r.domain] || r.domain
        }, maturity ${r.score}/3)`
    )
    .join("\n\n");

  const scoreLine = Object.entries(scores)
    .map(([k, v]) => `${DOMAIN_NAMES[k] || k} ${v}/6`)
    .join(" · ");

  return `Participant profile across the four Goleman domains: ${scoreLine}

Development focus domain: ${DOMAIN_NAMES[focus]} (their lowest)

Their responses:

${transcript}

Write the development brief for ${DOMAIN_NAMES[focus]}.`;
}

function parsePlan(text) {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

async function generate(apiKey, baseUrl, focus, scores, responses) {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(focus, scores, responses) }],
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("AI Gateway error", res.status, detail.slice(0, 500));
    throw new Error(`Gateway returned ${res.status}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const plan = parsePlan(text);
  if (!plan || !plan.headline) throw new Error("Brief came back incomplete.");
  return plan;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  let payload;
  try {
    payload = await req.json();
  } catch (_) {
    return json({ error: "Could not read the request." }, 400);
  }

  const { focus, scores, responses } = payload || {};

  if (
    !focus ||
    !DOMAIN_NAMES[focus] ||
    !scores ||
    typeof scores !== "object" ||
    !Array.isArray(responses) ||
    !responses.length
  ) {
    return json({ error: "Incomplete assessment data." }, 400);
  }

  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const baseUrl = readEnv("ANTHROPIC_BASE_URL");

  if (!apiKey || !baseUrl) {
    return json(
      { error: "AI Gateway is not active. Publish one production deploy, then reload." },
      503
    );
  }

  // Headers go out now; the body arrives when the model is done.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let out;
      try {
        out = { plan: await generate(apiKey, baseUrl, focus, scores, responses) };
      } catch (err) {
        console.error("coach failed", err && err.message ? err.message : err);
        out = { error: "The coach could not be reached." };
      }
      controller.enqueue(encoder.encode(JSON.stringify(out)));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

export const config = { path: "/api/coach" };
