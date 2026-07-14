# saas-reverse

[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org) [![Groq](https://img.shields.io/badge/Groq-Llama_3.3-orange)](https://groq.com)

Reverse-engineer any SaaS into a build blueprint.

Enter a domain and get a breakdown: features, pricing model, moat, churn vectors, real tech stack (pulled from job listings and HTML, not guessed), a build complexity estimate, and a prompt you can paste straight into Claude Code or Cursor.

**Web app:** `saas-reverse.com/notion.so`
**Claude Code skill:** `/saas-reverse linear.app`

---

## What it produces

- Product reality: what it actually does, for whom, at what price. No taglines.
- Feature map, split into core / differentiator / table stakes
- Business model: pricing tiers, free tier limits, the exact upgrade trigger
- Tech stack, tagged by whether it was seen directly or inferred
- Moat analysis: network effects, switching costs, data, brand, scored honestly (most SaaS have weak moats, and the output says so)
- Top 3 churn vectors, pulled from review signals
- Build time estimate per component, plus an MVP total
- Differentiation angle if you're building a competitor
- A build prompt ready to paste into an AI coding assistant

---

## Run locally

```bash
git clone https://github.com/Badi21/saas-reverse
cd saas-reverse
npm install
cp .env.example .env.local
# add GROQ_API_KEY (free at console.groq.com) and DATABASE_URL (free at neon.tech) to .env.local
npm run dev
```

Open `http://localhost:3000` and type `notion`, `linear`, or any domain.

Bare names resolve automatically: `linear` becomes `linear.app`, `notion` becomes `notion.so`.

---

## Claude Code skill

You can run the same analysis from the CLI, no web app needed:

```bash
cp -r skill/saas-reverse ~/.claude/skills/
```

```
/saas-reverse linear.app
/saas-reverse notion.so - we want to build something for freelancers
/saas-reverse stripe.com - focus on payment flows
```

This version uses Python (Scrapling + DDGS) and pulls in a few more sources than the web app: HackerNews threads, Reddit sentiment, job listings for tech stack signals.

---

## Deploy

```bash
npx vercel deploy
# set GROQ_API_KEY, DATABASE_URL (and APIFY_API_TOKEN if you use the Apify fallback) in Vercel environment variables
```

The cache and history live in Postgres (Neon), over their serverless HTTP driver, no connection pooling to manage. Shared across every instance, so under real concurrent traffic the cache actually works the way it's supposed to: the first person to analyze a domain pays the scrape-plus-LLM cost, everyone else within the 6-hour window gets the cached result, regardless of which instance handled their request.

`/api/analyze` sets `maxDuration = 60`, since the scrape-plus-analysis pipeline usually takes 30-50 seconds. That's the ceiling on Vercel's Hobby plan; Pro allows longer if you need more headroom.

---

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                 landing page + recent-analyses list
│  ├─ [domain]/page.tsx        streams the blueprint for a domain
│  └─ api/
│     ├─ analyze/route.ts      scrape, check cache, run the agent pipeline, persist
│     └─ history/route.ts      last 20 analyses, for the homepage list
└─ lib/
   ├─ rate-limit.ts            in-memory sliding-window limiter per IP
   ├─ db.ts                    Postgres (Neon serverless driver) repository
   ├─ agents.ts                the two-wave analysis pipeline
   └─ verify-claims.ts         checks [SEEN] price/percentage claims against the scrape
```

What happens on a request to `/api/analyze`:

1. Rate limit check first: 8 requests per 10 minutes per IP. This runs before any scraping, so someone hammering the endpoint can't run up the Groq bill.
2. Cache check: if the domain was analyzed in the last 6 hours, it returns that result immediately. No re-scrape, no LLM calls.
3. Otherwise it scrapes the site (SSRF guards active) and runs the analysis pipeline, then writes the finished result to Postgres.

### The analysis pipeline

`src/lib/agents.ts` runs two sequential Groq calls per analysis: one that covers everything (what it does, pricing, moat, churn, tech stack, build complexity) in one pass, then a second that reads that output and writes the final build prompt, so it doesn't end up contradicting the features or tech stack already described above it.

This used to be four calls (three parallel "analyst" agents plus the build-prompt one), each resending the full scraped content. That fell apart under real traffic: Groq's free tier caps at 30 requests/minute and 12,000 tokens/minute, and a single analysis under the four-call design could use most of that budget by itself, before any other user touched the site. Two calls, content sent once instead of up to four times, fits comfortably within the free tier for normal usage.

`verifySeenClaims()` then runs on the combined output: it pulls every dollar amount and percentage tagged `[SEEN]` and checks whether that figure actually appears in the scraped page text. Anything that doesn't match gets called out in a footer, which gets cached along with the rest.

The response still streams to the client the same way it always did, the frontend didn't change. Since both calls finish before anything is sent, that stream is a chunked reveal of the already-finished text rather than live tokens; the visible effect is the same.

The "Re-analyze" button sends `force: true`, which skips the cache and reruns the whole pipeline.

A 429 from Groq gets classified two ways: a short per-minute burst gets retried automatically with backoff, but the daily token quota (100,000/day on the free tier) being fully spent doesn't - retrying does nothing when Groq itself says "try again in an hour." The user gets an honest message either way instead of a generic "something went wrong."

Rate limiting is still a plain in-memory `Map`, not shared across instances. On a single Vercel instance that's fine; if this gets deployed with several instances running concurrently, the real limit is instances × 8 requests per 10 minutes, not a hard 8. Not fixed yet, see [SECURITY.md](SECURITY.md) for the tradeoff.

---

## Tech stack

- Next.js 15 (App Router) + Tailwind CSS
- Groq SDK, Llama 3.3 70B for the analysis
- Postgres (Neon) via `@neondatabase/serverless` for the cache and history
- Python (Scrapling, DDGS, HN Algolia API, Reddit search) in the Claude Code skill only
- SSRF protection: private IP blocking, DNS validation, manual redirect tracking

---

## License

GPL-3.0, see [LICENSE](LICENSE).
