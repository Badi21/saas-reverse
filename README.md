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
# add GROQ_API_KEY to .env.local (free at console.groq.com)
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
# set GROQ_API_KEY in Vercel environment variables
```

The cache and history live in `data/analyses.db` (SQLite), created on first request. On Vercel that file resets on every cold start unless you mount it on persistent storage. Fine for a demo, not for keeping history long term.

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
   ├─ db.ts                    SQLite (better-sqlite3) repository
   ├─ agents.ts                the two-wave analysis pipeline
   └─ verify-claims.ts         checks [SEEN] price/percentage claims against the scrape
```

What happens on a request to `/api/analyze`:

1. Rate limit check first: 8 requests per 10 minutes per IP. This runs before any scraping, so someone hammering the endpoint can't run up the Groq bill.
2. Cache check: if the domain was analyzed in the last 6 hours, it returns that result immediately. No re-scrape, no LLM calls.
3. Otherwise it scrapes the site (SSRF guards active) and runs the analysis pipeline, then writes the finished result to SQLite.

### The analysis pipeline

One giant prompt asking for every section at once is slow and gives the model more room to wander. `src/lib/agents.ts` splits it into two waves instead:

- **Wave one, three agents in parallel:** a product/business agent (what it does, target users, features, pricing), a strategy agent (moat, churn, differentiation), and a tech agent (stack, build complexity, pages, user flows). Same source content, same rules, each one only asked for its own slice. Wall-clock time is roughly the slowest of the three, not their sum.
- **Wave two, one agent:** takes wave one's combined output plus the original scrape and writes the final build prompt, so it doesn't end up describing different features than the sections above it.

`verifySeenClaims()` then runs on the combined output: it pulls every dollar amount and percentage tagged `[SEEN]` and checks whether that figure actually appears in the scraped page text. Anything that doesn't match gets called out in a footer, which gets cached along with the rest.

The response still streams to the client the same way it always did, the frontend didn't change. Since all four agent calls finish before anything is sent, that stream is a chunked reveal of the already-finished text rather than live tokens; the visible effect is the same.

The "Re-analyze" button sends `force: true`, which skips the cache and reruns the whole pipeline.

Rate limiting is still a plain in-memory `Map`, not shared across instances. On a single Vercel instance that's fine; if this gets deployed with several instances running concurrently, the real limit is instances × 8 requests per 10 minutes, not a hard 8. Not fixed yet, see [SECURITY.md](SECURITY.md) for the tradeoff.

---

## Tech stack

- Next.js 15 (App Router) + Tailwind CSS
- Groq SDK, Llama 3.3 70B for the analysis
- better-sqlite3 for the cache and history, no external DB
- Python (Scrapling, DDGS, HN Algolia API, Reddit search) in the Claude Code skill only
- SSRF protection: private IP blocking, DNS validation, manual redirect tracking

---

## License

GPL-3.0, see [LICENSE](LICENSE).
