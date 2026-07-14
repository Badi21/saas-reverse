# Security

## Reporting a vulnerability

Open a private security advisory on this repo (Security tab, "Report a vulnerability") or email the address on my GitHub profile. Please don't file a public issue for anything exploitable, give me a bit of time to patch before disclosing.

Tell me what you found, how to reproduce it, and what you think the impact is. A proof of concept helps but isn't required.

## What this app touches

saas-reverse takes a domain from an untrusted user and fetches it server-side. That's an SSRF surface by default, so most of the security work here is about constraining that one operation.

### SSRF protections (`src/app/api/analyze/route.ts`)

- Only `https://` targets are accepted. No `http://`, `file://`, `ftp://`.
- Hostnames are resolved via DNS before fetching. Every resolved address is checked against private and reserved ranges (RFC 1918, loopback, link-local, CGNAT, the cloud metadata address `169.254.169.254`, the usual TEST-NET blocks), for both IPv4 and IPv6.
- Bare IP literals are rejected the same way, so `https://127.0.0.1` and `https://169.254.169.254` never reach `fetch()`.
- Redirects are followed manually (`redirect: 'manual'`) and each hop gets re-validated the same way as the original request. A public domain redirecting to an internal address gets caught, not just the first hop.
- A small hostname blocklist covers `localhost` and the GCP/AWS metadata hostnames directly, in case DNS resolution for them somehow gets bypassed.

This covers the common SSRF-to-internal-network and SSRF-to-cloud-metadata patterns. It doesn't defend against DNS rebinding between the lookup and the actual `fetch()` call: an attacker who controls DNS TTLs could in theory race that window. If you're pointing this at a genuinely hostile input pool rather than "random public SaaS domains," fetch through a proxy that pins the resolved IP, or add an egress firewall.

### Rate limiting (`src/lib/rate-limit.ts`)

`/api/analyze` calls a paid LLM API on every uncached request, so this is a cost problem as much as a security one. Each client IP (from `X-Forwarded-For`, falling back to `X-Real-IP`) gets 8 requests per 10-minute window, checked before any scrape or LLM call happens.

It's in-memory and per-process: resets on redeploy, doesn't share state across multiple serverless instances. Under real concurrent traffic on Vercel, each instance keeps its own count, so the effective limit is closer to (instances × 8) per 10 minutes than a hard 8. That's a known tradeoff, not an oversight, fixing it properly needs a shared store (Upstash Redis, or Vercel's Marketplace Redis integration) and wasn't worth adding yet for the traffic this gets. The cache in `db.ts` already absorbs most of the load from repeat lookups of the same domain, which matters more in practice than a perfectly enforced per-IP limit.

### Claim verification (`src/lib/verify-claims.ts`)

The model is instructed to tag every claim as `[SEEN]` (present in the scraped page) or `[INFERRED]` (a guess), but that tag is self-reported by the same model that can hallucinate. Nothing stopped it from writing `[SEEN] $8/seat/month` for a number it made up.

After the stream finishes, `verifySeenClaims()` pulls every dollar amount and percentage out of lines tagged `[SEEN]` and checks whether that exact figure appears in the scraped source text. Anything that doesn't match gets flagged in a footer appended to the response, and that footer gets cached along with the rest so repeat views see it too.

This only catches numeric claims, since those are the only ones cheap to check without a second LLM call. A `[SEEN]` claim like "supports SSO" isn't verified this way, it would need either a second model pass or a rule-based check against known SSO indicators in the HTML, and neither is built yet.

### Analysis cache and history (`src/lib/db.ts`)

Completed analyses get cached in SQLite for 6 hours, keyed by domain, and the same rows populate the "recently analyzed" list on the homepage. Every query goes through `better-sqlite3` prepared statements, no string-built SQL, so there's no injection surface. The stored content is model output rendered as Markdown on the client (`react-markdown`), not raw HTML, so it isn't a stored-XSS vector either.

### Supported versions

This is a side project, not a product with an LTS policy. Fixes land on `main` only. If you're running a fork, pull from `main` rather than pinning a tag.
