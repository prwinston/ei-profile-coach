// EI Profile Coach — development plan generator
// Runs on Netlify Functions. Uses Netlify AI Gateway: ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL are injected automatically. No key configuration needed.

const MODEL = "claude-sonnet-4-5";

const DOMAIN_NAMES = {
  awareness: "Self-Awareness",
  regulation: "Self-Regulation",
  empathy: "Empathy",
  social: "Social Skills",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Could not read the request. Try again." }, 400);
  }

  const { focus, scores, responses } = payload || {};

  if (!focus || !DOMAIN_NAMES[focus] || !Array.isArray(responses) || !responses.length) {
    return json({ error: "Incomplete assessment data." }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL;

  if (!apiKey || !baseUrl) {
    return json(
      {
        error:
          "AI Gateway is not active on this project. Deploy to production once, then reload.",
      },
      503
    );
  }

  const transcript = responses
    .map(
      (r, i) =>
        `${i + 1}. ${r.situation}\n   Chose: "${r.choice}"\n   (${DOMAIN_NAMES[r.domain]}, maturity ${r.score}/3)`
    )
    .join("\n\n");

  const scoreLine = Object.entries(scores)
    .map(([k, v]) => `${DOMAIN_NAMES[k]} ${v}/6`)
    .join(" · ");

  const system = `You are an executive coach working with investment professionals — portfolio managers, analysts, relationship managers. You are writing a one-page development brief that will be printed and handed to a participant in a live workshop.

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

  const user = `Participant profile across the four Goleman domains: ${scoreLine}

Development focus domain: ${DOMAIN_NAMES[focus]} (their lowest)

Their responses:

${transcript}

Write the development brief for ${DOMAIN_NAMES[focus]}.`;

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("AI Gateway error", res.status, detail);
      return json({ error: "The coach could not be reached." }, 502);
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let plan;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("no json");
      plan = JSON.parse(cleaned.slice(start, end + 1));
    }

    return json({ plan });
  } catch (err) {
    console.error("coach function failed", err);
    return json({ error: "The coach could not be reached." }, 502);
  }
};

export const config = { path: "/api/coach" };
