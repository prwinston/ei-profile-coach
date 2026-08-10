# EI Profile Coach — Investment Desk Edition

A scenario-based emotional intelligence assessment. Eight real-world feedback moments from an investment context, mapped to Goleman's four domains, resolving to **one** development focus and a printable one-page brief.

Built for live in-session delivery. No build step, no npm install, no API key.

---

## Files

```
index.html                     the whole app (vanilla JS, no dependencies)
netlify.toml                   publish + functions config
netlify/functions/coach.mjs    generates the tailored brief via Netlify AI Gateway
README.md                      this file
```

## Deploy

**Option A — drag and drop (fastest)**
1. Zip the folder contents (not the folder itself).
2. Go to Netlify → Add new project → Deploy manually.
3. Drop the zip.

**Option B — Git**
Push the folder to a repo and connect it in Netlify. Leave the build command empty; publish directory `.`.

**One thing to know:** the AI Gateway only activates after a project has had at least one *production* deploy. If the brief comes back as "the standard brief for this domain" on your very first preview deploy, publish to production once and reload.

## How the AI key works

Netlify injects `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` into every Function at runtime. The function reads them from `process.env` and calls the Messages API through Netlify's gateway. There is nothing to configure, and no key ever touches the browser.

Available on Netlify's Free, Personal and Pro plans (credit-based). Usage bills against your Netlify credits.

---

## The scoring model

This is the part that makes it defensible, so it is worth understanding before you present it.

Each of the eight situations is **anchored to one domain**, and its four responses are four levels of maturity *within that domain*, scored 0 to 3. The options are shuffled so the ladder is invisible to the participant.

| Domain | Situations | Range |
|---|---|---|
| Self-Awareness | Quarterly review · 360 feedback | 0–6 |
| Self-Regulation | Red-day email · Third week behind | 0–6 |
| Empathy | Performance conversation · Client redemption | 0–6 |
| Social Skills | Sector call · Two juniors | 0–6 |

The **lowest** domain becomes the development focus. Ties break in Goleman's developmental sequence — self-awareness, then self-regulation, then empathy, then social skills — because regulation without awareness has nothing to act on.

Scoring runs entirely in the browser, instantly. Only the brief itself calls the model, which means one AI request per participant, not nine.

## Reliability in a live room

Every scenario has a hand-written fallback brief built into the page. If the gateway is slow, rate-limited or unreachable, the participant still gets a full, coherent, domain-specific result and a small note that it is the standard version. **The activity cannot fail in front of your room.**

On rate limits: one brief costs roughly 3 Netlify credits. The Free plan allows 90 credits per minute, so around 30 participants finishing simultaneously is the ceiling. A cohort of 25–30 will stagger naturally over two or three minutes and sit comfortably inside it. If you are running 50+, move to Personal (450/min).

## The PDF

The "Download as PDF" button opens the browser print dialogue with a print stylesheet that strips the interface and leaves only the brief. Participants choose "Save as PDF" as the destination. The name they type is used as the filename.

Tell them to type their name *before* they hit download.

---

## Facilitating it

**Before:** ask them to answer as they behave on a difficult day, not as they aspire to behave on a good one. Say it twice. It is the single biggest determinant of whether the profile is worth anything.

**During:** eight minutes. Keyboard shortcuts 1–4 select options, which speeds up anyone on a laptop.

**After:** the highest-value debrief question is not "do you agree with your focus domain?" It is: **"Who in this room already knew this about you?"** That question moves the result from self-report to social reality, and it usually produces the moment the session is remembered for.

**Pairing:** get them to read their "say this out loud this week" line to a partner. Out loud. The discomfort of hearing it in their own voice is the intervention.

## Changing the scenarios

All content lives in the `SITUATIONS` array near the top of the `<script>` block in `index.html`. Each situation needs a `domain`, a `setting`, a `scene`, a `prompt`, and exactly four options scored 0, 1, 2 and 3 in any display order. Keep two situations per domain to preserve the 0–6 range.

To retarget the app for a different sector, rewrite `setting` and `scene`, keep the maturity ladder, and adjust the coaching voice in the `system` prompt inside `coach.mjs`.
