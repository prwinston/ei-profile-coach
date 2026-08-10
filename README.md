# BIA EI Profile Coach

A scenario-based Emotional Intelligence profiling tool for the Feedback
Mastery Programme (Brunei Investment Agency), built from the full
`BIA_EI_Profile_Coach_GPT_v1_2.txt` system instruction (RTCC v2.0,
authored by Winston H.K. Chew).

Participants work through eight feedback scenarios in conversation with
the coach, then receive a personalised EI Profile Card mapping their
responses across Goleman's four domains (Self-Awareness, Self-Regulation,
Empathy, Social Skills), with an optional reflection phase afterward.

## No Anthropic API key needed

This runs on **Netlify's AI Gateway**, which gives Netlify Functions
access to Claude automatically — no Anthropic account, no API key to
paste anywhere. Netlify bills the usage as **credits on your Netlify
plan** instead.

**One thing to know:** the Gateway only activates after the site's
**first production deploy**. If the very first session you try returns
an error, deploy (or redeploy) once and try again — after that it works
automatically.

## How the whole system instruction is used

`netlify/functions/lib/system-prompt.mjs` contains the **entire, verbatim
text** of `BIA_EI_Profile_Coach_GPT_v1_2.txt` — every section, rule,
scenario, scoring key, narrative, and guardrail — exactly as authored.
It's sent as Claude's system prompt on every turn. The single
`netlify/functions/coach.mjs` function just forwards the running
conversation to Claude and returns its reply; there's no separate app
logic re-implementing phases, scoring, or scenario order; the model
follows the document's own Core Engagement Structure (Section 6) exactly
as it was designed to.

**If you revise the source document**, regenerate this file rather than
hand-editing it, so the deployed prompt never drifts from the authored
version. From the project root:

```bash
python3 - << 'PY'
with open('BIA_EI_Profile_Coach_GPT_v1_2.txt', encoding='utf-8') as f:
    raw = f.read()
escaped = raw.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
with open('netlify/functions/lib/system-prompt.mjs', 'w', encoding='utf-8') as f:
    f.write("export const SYSTEM_PROMPT = `" + escaped + "`;\n")
PY
```

(A copy of the source `.txt` isn't included in this project by default —
add your revised version alongside it before running the snippet above.)

## Cost / abuse note

Anyone with your site's URL can start a session, and each session spends
Netlify credits over its ~20-minute conversation. If you're sharing the
link broadly:

- Set the optional `ACCESS_CODE` environment variable (see below) so
  only participants you've given the code to can start a session.
- Consider Netlify's built-in rate limiting for extra protection:
  https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/

## Deploy it

**Option A — connect a Git repo (recommended)**

1. Push this folder to a new GitHub repository.
2. In Netlify: **Add new site → Import an existing project**, pick the
   repo. Settings are auto-detected from `netlify.toml`.
3. Deploy. That first deploy is also what activates the AI Gateway — no
   environment variables are required to get it working.
4. Optional: add an `ACCESS_CODE` environment variable under **Site
   configuration → Environment variables** for a class-code gate, then
   redeploy.

**Option B — Netlify CLI**

```bash
npm install -g netlify-cli
cd ei-profile-coach
netlify login
netlify deploy --prod
```

## Local development

```bash
netlify dev
```

The Netlify CLI supports the AI Gateway locally, so this should work
without any `.env` file. For the class-code gate while testing locally,
create a `.env` file (not committed) with `ACCESS_CODE=...`.

## Troubleshooting: "The coach did not respond"

This app's system prompt is unusually large (~16,000 tokens — it's your
entire authored document), and Netlify's standard functions have a
synchronous execution limit (10 seconds by default, 26 seconds on Pro on
request). A full reply — especially the Profile Card at the end — can take
longer than that to generate in full.

To fix this, `coach.mjs` streams Claude's reply straight through to the
browser token-by-token instead of waiting to assemble the whole message
first, and the system prompt is marked for prompt caching so turns after
the first one in a session skip re-processing all ~16k tokens (cached for
5 minutes). Between the two, most turns should complete comfortably.

If you still see this error after redeploying with these changes:
- Confirm the deploy succeeded and check **Functions → coach → Logs** in
  the Netlify dashboard for the actual error — it will show a more
  specific message than the browser's generic one.
- If you're on a Pro plan and it's still tight, you can request the
  extended 26-second synchronous function timeout from Netlify support.
- As a last resort, lowering `maxTokens` in `coach.mjs` (e.g. to 2048)
  shortens the longest possible reply and reduces the risk further,
  though the Profile Card format is fairly verbose by design.

## Notes

- Uses `claude-sonnet-5` via Netlify's AI Gateway, at the temperature
  (0.35) and output ceiling (4,096 tokens) specified in the source
  document's platform settings.
- No database — each participant's session lives only in their browser
  tab; nothing is stored server-side, matching Section 12's "no session
  retention" disclosure.
- The class-code check is a light deterrent, not real authentication —
  fine for a facilitated cohort, not for anything requiring real access
  control.
- The crisis-response resources embedded in the system instruction
  (Talian Harapan Brunei, PAPDA, Crisis Text Line) are part of the
  authored document and are preserved verbatim.
