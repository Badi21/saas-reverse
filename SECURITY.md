# Security

## Reporting a vulnerability

Open a private security advisory on this repo (Security tab → "Report a vulnerability") or email the address listed on the maintainer's GitHub profile. Please don't open a public issue for anything exploitable — give a short time to patch before disclosing.

Include: what you found, how to reproduce it, and what you think the impact is. A working proof of concept helps but isn't required.

## What this app touches

`saas-reverse` takes a domain from an untrusted user and fetches it server-side. That's an SSRF surface by default, so most of the security work here is about constraining that one operation.

### SSRF protections (`src/app/api/analyze/route.ts`)

- Only `https://` targets are accepted — no `http://`, `file://`, `ftp://`, etc.
- Hostnames are resolved via DNS before fetching, and every resolved address is checked against private/reserved ranges (RFC 1918, loopback, link-local, CGNAT, the cloud metadata address `169.254.169.254`, and the usual TEST-NET blocks) — both IPv4 and IPv6.
- Bare IP literals are rejected the same way, so `https://127.0.0.1` and `https://169.254.169.254` never reach `fetch()`.
- Redirects are followed manually (`redirect: 'manual'`), and each hop is re-validated the same way as the original request — a public domain redirecting to an internal address is caught, not just the first request.
- A small hostname blocklist covers `localhost` and the GCP/AWS metadata hostnames directly, in case DNS resolution for them is somehow bypassed.

This blocks the common SSRF-to-internal-network and SSRF-to-cloud-metadata patterns. It does not defend against DNS rebinding between the lookup and the actual `fetch()` call — a determined attacker controlling DNS TTLs could in theory race that window. If you're running this against a genuinely hostile input pool (not just "random public SaaS domains"), consider fetching through a proxy that pins the resolved IP, or adding a HAP (Host Access Policy)-style egress firewall.

### Rate limiting (`src/lib/rate-limit.ts`)

The `/api/analyze` endpoint calls a paid LLM API for every uncached request, so it's also a cost-abuse surface, not just a security one. Each client IP (from `X-Forwarded-For`, falling back to `X-Real-IP`) is limited to 8 requests per 10-minute sliding window before a scrape or LLM call ever happens.

This is in-memory and per-process — it resets on redeploy and doesn't share state across multiple serverless instances. That's an accepted limitation for a small single-instance deployment; if this runs behind a load balancer with several instances, replace it with a shared store (Upstash Redis, Vercel KV, etc.) so the limit actually holds across instances.

### Analysis cache / history (`src/lib/db.ts`)

Completed analyses are cached in SQLite for 6 hours, keyed by domain, and also used to populate the "recently analyzed" list on the homepage. All queries are parameterized (`better-sqlite3` prepared statements) — no string-built SQL, so there's no injection surface here. The stored content is model output rendered as Markdown on the client (`react-markdown`), not raw HTML, so it isn't a stored-XSS vector either.

### Supported versions

This is a small side project, not a maintained product with an LTS policy — security fixes land on `main` only. If you're running a fork, pull from `main` rather than pinning to a tag.
