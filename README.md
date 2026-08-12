# EI Profile Coach — Investment Desk Edition

A scenario-based emotional intelligence assessment. Eight real-world feedback moments from an investment context, mapped to Goleman's four domains, resolving to **one** development focus and a printable one-page brief.

Built for live in-session delivery. No build step, no npm install, no API key.

---

## Files

```
index.html                          the whole app (vanilla JS, no dependencies)
netlify.toml                        publish + edge function config
netlify/edge-functions/coach.js     generates the tailored brief via Netlify AI Gateway
README.md                           this file
```

**The folder structure matters.** `coach.js` must sit inside `netlify/edge-functions/`. If it ends up at the root next to `index.html`, there is no function, `/api/coach` returns 404, and every participant silently receives the standard fallback brief instead of a tailored one. This is the single easiest way to break the app, and it breaks quietly.

## Deploy

**Option A — drag and drop (fastest)**
1. Select the *contents* of this folder, including the `netlify` folder, and zip them.
2. Netlify → Add new project → Deploy manually.
3. Drop the zip.
4. Confirm the deploy log shows one edge function packaged.

**Option B — Git**
Push the folder to a repo and connect it in Netlify. Leave the build command empty; publish directory `.`.

**One thing to know:** the AI Gateway only activates after a project has had at least one *production* deploy. If the brief comes back as "the standard brief for this domain" on your very first preview deploy, publish to production once and reload.

## Why this is an edge function, not a regular one

This is the part worth understanding, because it is what stops the activity degrading in front of your room.

Netlify's standard serverless functions are killed at 10 seconds. Writing a full structured brief takes Sonnet longer than that fairly often, so a standard function would get terminated mid-generation and the app would fall back to the canned brief for a large share of your participants. It would look like it was working. It would not be.

Edge functions only need to return response *headers* within 40 seconds, and can keep writing to the response stream after that. So `coach.js` opens the response immediately and pushes the finished JSON in when the model is done. The generation now has room to breathe.

One consequence worth remembering if you ever edit the client: because the response opens before the work is finished, `res.ok` tells you only that the headers arrived. The real success signal is whether a `plan` came back in the payload. The client checks for that, not for the status code.

## How the AI key works

Netlify injects `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` into every compute context at runtime, edge functions included. The function reads them and calls the Messages API through Netlify's gateway. There is nothing to configure, and no key ever touches the browser.

Available on Netlify's Free, Personal and Pro plans. Usage bills against your Netlify credits.

---

## The scoring model

Each of the eight situations is **anchored to one domain**, and its four responses are four levels of maturity *within that domain*, scored 0 to 3. The options are shuffled independently for every participant at the moment they begin, so the ladder is invisible and no two people in the room see the same running order.

| Domain | Situations | Range |
|---|---|---|
| Self-Awareness | Quarterly review · 360 feedback | 0–6 |
| Self-Regulation | Red-day email · Third week behind | 0–6 |
| Empathy | Performance conversation · Client redemption | 0–6 |
| Social Skills | Sector call · Two juniors | 0–6 |

The **lowest** domain becomes the development focus. Ties break in Goleman's developmental sequence — self-awareness, then self-regulation, then empathy, then social skills — because regulation without awareness has nothing to act on.

Scoring runs entirely in the browser, instantly. Only the brief itself calls the model, which means one AI request per participant, not nine.

## Reliability in a live room

Every domain has a hand-written fallback brief built into the page. If the gateway is slow, rate-limited or unreachable, the participant still gets a full, coherent, domain-specific result and a small note that it is the standard version. **The activity cannot fail in front of your room.**

The client also gives up after 40 seconds and shows the fallback rather than spinning indefinitely.

On rate limits: one brief costs roughly 3 Netlify credits. The Personal plan allows 450 credits per minute, which is around 150 briefs finishing in the same minute. A cohort of 15 is nowhere near it. You would need to be running well over 100 people simultaneously before this became a consideration.

## The PDF

The "Download as PDF" button opens the browser print dialogue with a print stylesheet that strips the interface and leaves only the brief. Participants choose "Save as PDF" as the destination. The name they type is used as the filename.

If they click download with the name field empty, the field is focused and the placeholder changes to prompt them. A second click proceeds regardless, so nobody gets stuck.

---

## Facilitating it

**Before:** ask them to answer as they behave on a difficult day, not as they aspire to behave on a good one. Say it twice. It is the single biggest determinant of whether the profile is worth anything.

**During:** eight minutes. Keyboard shortcuts 1–4 select options, which speeds up anyone on a laptop. Backspace goes back a step.

**After:** the highest-value debrief question is not "do you agree with your focus domain?" It is: **"Who in this room already knew this about you?"** That question moves the result from self-report to social reality, and it usually produces the moment the session is remembered for.

**Pairing:** get them to read their "say this out loud this week" line to a partner. Out loud. The discomfort of hearing it in their own voice is the intervention.

## Changing the scenarios

All content lives in the `SITUATIONS` array near the top of the `<script>` block in `index.html`. Each situation needs a `domain`, a `setting`, a `scene`, a `prompt`, and exactly four options scored 0, 1, 2 and 3. Display order in the source no longer matters, since the app shuffles at runtime. Keep two situations per domain to preserve the 0–6 range.

To retarget the app for a different sector, rewrite `setting` and `scene`, keep the maturity ladder, and adjust the coaching voice in the `SYSTEM` prompt inside `coach.js`.
