#!/usr/bin/env python3
"""Multi-source intelligence gatherer: DDGS + HackerNews + Reddit + job listings."""

import sys
import json
import re
import time
from urllib.parse import quote_plus

# Auto-install deps if missing
def _ensure(pkg, import_name=None):
    import importlib
    mod = import_name or pkg.replace('-', '_')
    try:
        importlib.import_module(mod)
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', pkg, '-q'], check=True)

_ensure('duckduckgo-search', 'duckduckgo_search')
_ensure('requests')


def _ddgs_search(query: str, max_results: int = 6) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception:
        return []


def _hn_search(query: str, max_results: int = 10) -> list[dict]:
    import requests
    try:
        url = f'https://hn.algolia.com/api/v1/search?query={quote_plus(query)}&hitsPerPage={max_results}'
        r = requests.get(url, timeout=8)
        if not r.ok:
            return []
        hits = []
        for h in r.json().get('hits', []):
            hits.append({
                'type': h.get('_tags', [''])[0],
                'title': (h.get('title') or h.get('story_title') or '').strip(),
                'text': re.sub(r'<[^>]+>', ' ', h.get('comment_text') or '').strip()[:400],
                'points': h.get('points') or 0,
                'url': f"https://news.ycombinator.com/item?id={h.get('objectID')}",
            })
        return hits
    except Exception:
        return []


def _reddit_search(query: str, max_results: int = 8) -> list[dict]:
    import requests
    headers = {'User-Agent': 'saas-research-bot/1.0'}
    try:
        url = f'https://www.reddit.com/search.json?q={quote_plus(query)}&sort=relevance&limit={max_results}'
        r = requests.get(url, headers=headers, timeout=8)
        if not r.ok:
            return []
        posts = []
        for child in r.json().get('data', {}).get('children', []):
            p = child.get('data', {})
            posts.append({
                'title': p.get('title', ''),
                'selftext': p.get('selftext', '')[:400],
                'score': p.get('score', 0),
                'subreddit': p.get('subreddit', ''),
                'url': 'https://reddit.com' + p.get('permalink', ''),
            })
        return posts
    except Exception:
        return []


def _extract_name(domain: str) -> str:
    """'linear.app' → 'Linear', 'notion.so' → 'Notion'"""
    parts = domain.lower().split('.')
    # remove TLD (last part) and www
    clean = [p for p in parts if p not in ('com', 'io', 'app', 'so', 'co', 'ai', 'dev', 'net', 'org', 'www')]
    return clean[0].capitalize() if clean else domain


def gather(domain: str) -> dict:
    name = _extract_name(domain)
    base_query = f'{name} {domain}'

    intel: dict = {
        'domain': domain,
        'product_name': name,
        'reviews': [],
        'pain_points': [],
        'alternatives': [],
        'pricing_intel': [],
        'job_tech_signals': [],
        'hn_discussions': [],
        'reddit_sentiment': [],
    }

    # -- Reviews: G2 / Capterra / Trustpilot --
    q_review = f'{name} reviews site:g2.com OR site:capterra.com OR site:trustpilot.com'
    intel['reviews'] = [
        {'title': r.get('title', ''), 'snippet': r.get('body', '')[:350]}
        for r in _ddgs_search(q_review, 5)
    ]
    time.sleep(0.3)

    # -- Pain points & complaints --
    q_pain = f'{name} problems complaints "wish it had" "doesn\'t" "can\'t" users 2024 2025'
    intel['pain_points'] = [
        {'title': r.get('title', ''), 'snippet': r.get('body', '')[:350]}
        for r in _ddgs_search(q_pain, 5)
    ]
    time.sleep(0.3)

    # -- Alternatives & competitors --
    q_alt = f'{name} alternatives competitors 2025'
    intel['alternatives'] = [
        {'title': r.get('title', ''), 'snippet': r.get('body', '')[:350]}
        for r in _ddgs_search(q_alt, 6)
    ]
    time.sleep(0.3)

    # -- Pricing intel (often more than on-site) --
    q_price = f'{name} pricing per seat cost plan 2025'
    intel['pricing_intel'] = [
        {'title': r.get('title', ''), 'snippet': r.get('body', '')[:350]}
        for r in _ddgs_search(q_price, 4)
    ]
    time.sleep(0.3)

    # -- Job listings → real tech stack --
    q_jobs = f'"{name}" engineer jobs react postgresql typescript python rust go golang'
    intel['job_tech_signals'] = [
        {'title': r.get('title', ''), 'snippet': r.get('body', '')[:350]}
        for r in _ddgs_search(q_jobs, 5)
    ]
    time.sleep(0.3)

    # -- HackerNews --
    intel['hn_discussions'] = _hn_search(name, 10)
    time.sleep(0.3)

    # -- Reddit --
    intel['reddit_sentiment'] = _reddit_search(f'{name} {domain}', 8)

    return intel


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 saas_intel.py <domain>', file=sys.stderr)
        sys.exit(1)

    data = gather(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
