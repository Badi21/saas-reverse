# saas-reverse

[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org) [![Groq](https://img.shields.io/badge/Groq-Llama_3.3-orange)](https://groq.com)

Reverse-engineer any SaaS into a venture-analyst-grade build blueprint.

Enter a domain. Get moat analysis, churn vectors, real tech stack (from job listings + HTML), upgrade gate mechanics, build complexity estimate, and a prompt to recreate it — in under 30 seconds.

**Web app:** `saas-reverse.com/notion.so`
**Claude Code skill:** `/saas-reverse linear.app`

---

## What it produces

- **Product reality** — what it actually does, for whom, at what price (not taglines)
- **Feature map** — Core / Differentiator / Table stakes classification
- **Business model** — pricing tiers, free tier hard limits, upgrade gate trigger
- **Real tech stack** — detected from HTML patterns, response headers, job listings
- **Moat analysis** — network effects / switching costs / data / brand, each scored
- **Churn vectors** — top 3 reasons users leave, from review signals
- **Build complexity** — days estimate per component + MVP total in weeks
- **Differentiation angle** — underserved segment, winning feature, what the incumbent won't build
- **Build prompt** — paste directly into Claude Code or Cursor to start building

---

## Run locally

```bash
git clone https://github.com/Badi21/saas-reverse
cd saas-reverse
npm install
cp .env.example .env.local
# Add GROQ_API_KEY to .env.local (free at console.groq.com)
npm run dev
```

Open `http://localhost:3000`. Type `notion`, `linear`, or any domain.

Bare names resolve automatically — `linear` → `linear.app`, `notion` → `notion.so`.

---

## Claude Code skill

Use it directly inside Claude Code without the web app:

```bash
cp -r skill/saas-reverse ~/.claude/skills/
```

Then in any Claude Code session:

```
/saas-reverse linear.app
/saas-reverse notion.so - we want to build something for freelancers
/saas-reverse stripe.com - focus on payment flows
```

The skill uses Python (Scrapling + DDGS) for multi-source intelligence: live scraping, HackerNews discussions, Reddit sentiment, job listings for real tech stack signals.

---

## Deploy

```bash
npx vercel deploy
# Set GROQ_API_KEY in Vercel environment variables
```

The SQLite cache/history file lives at `data/analyses.db`, created on first request. On Vercel, mount a persistent volume or point it at durable storage — otherwise it resets on every cold start (fine for demo use, not for long-term history).

---

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                 landing page + recent-analyses list
│  ├─ [domain]/page.tsx        streams the blueprint for a domain
│  └─ api/
│     ├─ analyze/route.ts      scrape → cache check → LLM stream → persist
│     └─ history/route.ts      last 20 analyses, for the homepage list
└─ lib/
   ├─ rate-limit.ts            in-memory sliding-window limiter per IP
   └─ db.ts                    SQLite (better-sqlite3) repository
```

**Request flow for `/api/analyze`:**

1. Rate-limit check (8 requests / 10 min per IP) — rejects before any scraping happens, so abuse can't run up the Groq bill.
2. Cache check — if this domain was analyzed in the last 6 hours, the stored result is returned instantly, no re-scrape, no LLM call.
3. Otherwise: scrape the site (with SSRF guards), stream the analysis from Groq, and persist the finished result to SQLite once the stream closes.

The "Re-analyze" button on a result page sends `force: true`, which skips the cache and always re-runs the full pipeline.

This keeps the whole thing to two small modules instead of pulling in Redis or a hosted rate-limiting service — the cache and history share one table, and the limiter is a plain `Map` that resets on redeploy. See [SECURITY.md](SECURITY.md) for the reasoning and its limits.

---

## Tech stack

- Next.js 15 (App Router) + Tailwind CSS
- Groq SDK — Llama 3.3 70B for analysis
- better-sqlite3 — analysis cache + history, no external DB needed
- Python — Scrapling, DDGS, HN Algolia API, Reddit search (Claude Code skill only)
- SSRF protection — private IP blocking, DNS validation, manual redirect tracking

---

## License

GPL-3.0 — see [LICENSE](LICENSE).
