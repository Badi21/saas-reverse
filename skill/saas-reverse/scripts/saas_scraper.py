#!/usr/bin/env python3
"""Scrapes a SaaS domain and outputs structured content for analysis."""

import sys
import json
import re
from urllib.parse import urlparse, urljoin

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

PRIMARY_PATHS = ['', '/pricing', '/features', '/product', '/about', '/solutions']
SECONDARY_PATHS = ['/blog', '/changelog', '/enterprise', '/docs', '/team', '/customers']

TECH_PATTERNS = {
    'react': r'react(?:\.min)?\.js|from \'react\'|\"react\"',
    'next': r'_next/static|__NEXT_DATA__|next\.js',
    'vue': r'vue(?:\.min)?\.js|__vue_',
    'nuxt': r'_nuxt/|__NUXT__',
    'svelte': r'svelte|__svelte',
    'angular': r'angular(?:\.min)?\.js|ng-version',
    'tailwind': r'tailwindcss|tw-',
    'stripe': r'stripe\.com/v3|js\.stripe\.com',
    'segment': r'analytics\.js|segment\.com',
    'intercom': r'intercomcdn\.com|intercom-',
    'crisp': r'crisp\.chat|client\.crisp',
    'vercel': r'vercel\.com|_vercel',
    'cloudflare': r'cloudflare\.com|__cf_',
    'supabase': r'supabase\.co|supabase\.io',
    'clerk': r'clerk\.dev|clerk\.com',
    'auth0': r'auth0\.com',
    'mixpanel': r'mixpanel\.com',
    'amplitude': r'amplitude\.com',
    'posthog': r'posthog\.com',
    'graphql': r'graphql|__typename',
    'prisma': r'prisma\.io|prisma-client',
    'planetscale': r'planetscale\.com',
    'neon': r'neon\.tech|neondb',
    'resend': r'resend\.com',
    'sendgrid': r'sendgrid\.com',
    'twilio': r'twilio\.com',
    'launchdarkly': r'launchdarkly\.com|ldclient',
    'datadog': r'datadoghq\.com|DD_RUM',
    'sentry': r'sentry\.io|Sentry\.init',
    'hotjar': r'hotjar\.com|hj\(',
    'hubspot': r'hubspot\.com|_hsp',
}

HEADER_TECH = {
    'x-powered-by': {'express': 'node-express', 'next.js': 'next', 'php': 'php', 'rails': 'ruby-rails'},
    'server': {'nginx': 'nginx', 'apache': 'apache', 'cloudflare': 'cloudflare', 'vercel': 'vercel'},
    'cf-ray': {'': 'cloudflare'},
    'x-vercel-id': {'': 'vercel'},
    'x-amz': {'': 'aws'},
}

PRICING_PATTERNS = [
    r'\$\d+(?:\.\d+)?(?:/mo|/month|/seat|/user|/year|/yr)?',
    r'€\d+(?:\.\d+)?(?:/mo|/month|/seat|/user|/year|/yr)?',
    r'free\s+(?:forever|tier|plan|trial)',
    r'(?:per\s+seat|per\s+user|per\s+month)',
    r'(?:billed\s+annually|annual\s+billing)',
    r'(?:enterprise|custom\s+pricing|contact\s+sales)',
    r'(?:14|30|7)-day\s+(?:free\s+)?trial',
]

SOCIAL_PROOF_PATTERNS = [
    r'(\d[\d,]+)\s*(?:users|customers|companies|teams|organizations)',
    r'trusted\s+by\s+[\w\s,]+',
    r'(?:used\s+by|loved\s+by)\s+[\w\s]+',
    r'(\d+[kmb+]+)\s*(?:users|teams)',
    r'(?:G2|Capterra|Product\s+Hunt)\s+(?:top|best|award)',
]


def normalize_url(domain: str) -> str:
    if not domain.startswith('http://') and not domain.startswith('https://'):
        domain = f'https://{domain}'
    return domain.rstrip('/')


def strip_html(html: str) -> str:
    html = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<])*<\/script>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<style\b[^<]*(?:(?!<\/style>)<[^<])*<\/style>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<nav\b[^<]*(?:(?!<\/nav>)<[^<])*<\/nav>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<footer\b[^<]*(?:(?!<\/footer>)<[^<])*<\/footer>', ' ', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.DOTALL)
    html = re.sub(r'<[^>]+>', ' ', html)
    html = re.sub(r'&[a-z]+;', ' ', html)
    html = re.sub(r'\s+', ' ', html)
    return html.strip()


def extract_headlines(html: str) -> list[str]:
    headlines = []
    for tag in ('h1', 'h2', 'h3'):
        for m in re.finditer(rf'<{tag}[^>]*>(.*?)</{tag}>', html, re.IGNORECASE | re.DOTALL):
            text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            if text and len(text) > 5:
                headlines.append(text)
    return headlines[:20]


def extract_meta(html: str) -> dict:
    meta: dict = {}
    title_m = re.search(r'<title[^>]*>([^<]+)<\/title>', html, re.IGNORECASE)
    if title_m:
        meta['title'] = title_m.group(1).strip()

    for name in ['description', 'og:title', 'og:description', 'twitter:description']:
        key = name.replace(':', '_')
        m = re.search(
            rf'<meta[^>]*(?:name|property)=["\']{re.escape(name)}["\']\s[^>]*content=["\'](.*?)["\']',
            html, re.IGNORECASE
        )
        if not m:
            m = re.search(
                rf'<meta[^>]*content=["\'](.*?)["\']\s[^>]*(?:name|property)=["\']{re.escape(name)}["\']',
                html, re.IGNORECASE
            )
        if m:
            meta[key] = m.group(1).strip()

    return meta


def detect_tech_from_html(html: str) -> set[str]:
    found = set()
    for tech, pattern in TECH_PATTERNS.items():
        if re.search(pattern, html, re.IGNORECASE):
            found.add(tech)
    return found


def detect_tech_from_headers(headers: dict) -> set[str]:
    found = set()
    for header_name, mappings in HEADER_TECH.items():
        value = headers.get(header_name, '').lower()
        if not value:
            continue
        for keyword, tech in mappings.items():
            if keyword == '' or keyword in value:
                found.add(tech)
    return found


def extract_pricing_signals(text: str) -> list[str]:
    signals = []
    for pattern in PRICING_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        signals.extend(matches)
    return list(set(signals))[:20]


def extract_social_proof(text: str) -> list[str]:
    signals = []
    for pattern in SOCIAL_PROOF_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        signals.extend([m if isinstance(m, str) else m[0] for m in matches])
    return list(set(signals))[:10]


def extract_cta_language(html: str) -> list[str]:
    ctas = []
    for m in re.finditer(r'<(?:a|button)[^>]*>(.*?)</(?:a|button)>', html, re.IGNORECASE | re.DOTALL):
        text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        if 5 < len(text) < 60:
            ctas.append(text)
    seen = set()
    unique = []
    for c in ctas:
        norm = c.lower()
        if norm not in seen:
            seen.add(norm)
            unique.append(c)
    return unique[:15]


def fetch_page(url: str) -> tuple[str | None, dict]:
    """Returns (html, response_headers)."""
    try:
        from scrapling import StealthyFetcher
        page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
        if page:
            return page.html_content, {}
    except Exception:
        pass

    try:
        from scrapling import Fetcher
        page = Fetcher.fetch(url)
        if page:
            return page.html_content, {}
    except Exception:
        pass

    try:
        import requests
        resp = requests.get(url, headers=HEADERS, timeout=8, allow_redirects=True)
        if resp.ok:
            return resp.text, dict(resp.headers)
    except Exception:
        pass

    return None, {}


def fetch_robots(base: str) -> list[str]:
    """Parse robots.txt for interesting paths (sitemaps, disallowed sections)."""
    html, _ = fetch_page(f'{base}/robots.txt')
    if not html:
        return []
    paths = []
    for line in html.splitlines():
        line = line.strip()
        if line.lower().startswith('sitemap:'):
            paths.append(line.split(':', 1)[1].strip())
        elif line.lower().startswith('disallow:') and len(line) > 10:
            path = line.split(':', 1)[1].strip()
            if path and path != '/':
                paths.append(path.split('*')[0].split('?')[0])
    return list(set(paths))[:10]


def scrape(domain: str) -> dict:
    base = normalize_url(domain)
    result: dict = {
        'domain': domain,
        'base_url': base,
        'pages': {},
        'meta': {},
        'headlines': [],
        'cta_language': [],
        'tech_signals': [],
        'pricing_signals': [],
        'social_proof': [],
        'feature_signals': '',
        'discovered_paths': [],
    }

    all_tech: set[str] = set()
    all_pricing: list[str] = []
    all_proof: list[str] = []
    all_ctas: list[str] = []

    # Discover extra paths from robots.txt
    robot_paths = fetch_robots(base)
    result['discovered_paths'] = robot_paths

    paths_to_fetch = list(dict.fromkeys(PRIMARY_PATHS + SECONDARY_PATHS))

    for path in paths_to_fetch:
        url = f'{base}{path}'
        html, resp_headers = fetch_page(url)
        if not html or len(html) < 300:
            continue

        if path == '':
            result['meta'] = extract_meta(html)
            result['headlines'] = extract_headlines(html)
            result['cta_language'] = extract_cta_language(html)
            all_tech.update(detect_tech_from_html(html))
            all_tech.update(detect_tech_from_headers(resp_headers))

        text = strip_html(html)
        result['pages'][path or '/'] = text[:4000]

        all_pricing.extend(extract_pricing_signals(text))
        all_proof.extend(extract_social_proof(text))

        if path in ('/features', '/product', '', '/pricing'):
            result['feature_signals'] += text[:2000] + '\n'

    result['tech_signals'] = sorted(all_tech)
    result['pricing_signals'] = list(set(all_pricing))[:20]
    result['social_proof'] = list(set(all_proof))[:10]

    return result


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 saas_scraper.py <domain>', file=sys.stderr)
        sys.exit(1)

    data = scrape(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
