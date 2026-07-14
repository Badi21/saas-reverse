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
│     ├─ analyze/route.ts      scrape, check cache, stream from the LLM, persist
│     └─ history/route.ts      last 20 analyses, for the homepage list
└─ lib/
   ├─ rate-limit.ts            in-memory sliding-window limiter per IP
   └─ db.ts                    SQLite (better-sqlite3) repository
```

What happens on a request to `/api/analyze`:

1. Rate limit check first: 8 requests per 10 minutes per IP. This runs before any scraping, so someone hammering the endpoint can't run up the Groq bill.
2. Cache check: if the domain was analyzed in the last 6 hours, it returns that result immediately. No re-scrape, no LLM call.
3. Otherwise it scrapes the site (with SSRF guards active), streams the analysis from Groq, and writes the finished result to SQLite once the stream ends.

The "Re-analyze" button sends `force: true`, which skips the cache and reruns everything.

I kept this to two small modules instead of adding Redis or a hosted rate-limiter. Cache and history share one table, and the limiter is just a `Map` that resets on redeploy. That's a real limitation, not an oversight, see [SECURITY.md](SECURITY.md) for what it does and doesn't cover.

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
