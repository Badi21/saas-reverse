'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RecentAnalysis {
  domain: string;
  title: string;
  createdAt: number;
}

const EXAMPLES = ['notion', 'linear', 'framer', 'cal', 'loom'];

const PREVIEW_LINES = [
  { type: 'h2', text: 'What it does' },
  { type: 'p', text: 'Project management for software teams. Issue tracking, sprints, roadmaps, and Git sync. $8/seat/month — positioned against Jira and Asana as "the tool built for modern dev teams."' },
  { type: 'h2', text: 'Core features' },
  { type: 'li', text: 'Issue tracking — create, assign, prioritize with sub-issues and dependencies' },
  { type: 'li', text: 'Cycles — sprint-based planning with burndown and velocity tracking' },
  { type: 'li', text: 'Roadmaps — timeline view linking issues to milestones' },
  { type: 'li', text: 'Git integration — auto-close issues on PR merge via GitHub / GitLab' },
  { type: 'h2', text: 'Recommended tech stack' },
  { type: 'stack', items: [['Frontend', 'Next.js 15 + Tailwind + shadcn/ui'], ['Backend', 'tRPC + PostgreSQL (Neon)'], ['Auth', 'Clerk'], ['Real-time', 'Ably or Pusher']] },
];

function TerminalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export default function Home() {
  const [domain, setDomain] = useState('');
  const [recent, setRecent] = useState<RecentAnalysis[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => setRecent(data.analyses || []))
      .catch(() => {});
  }, []);

  function analyze(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim();
    if (!d) return;
    router.push(`/${encodeURIComponent(d)}`);
  }

  const urlHint = domain.trim()
    ? domain.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0]
    : null;

  return (
    <main className="min-h-screen bg-[#080808] relative">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        style={{
          backgroundImage: 'radial-gradient(#1c1c1c 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-sm border-b border-[#161616]">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-lime-400">
            <TerminalIcon />
            <span className="font-mono text-sm font-bold tracking-tight">saas-reverse</span>
          </div>
          <a
            href="https://github.com/Badi21/saas-reverse"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-6 pt-20 pb-12">
        {/* Headline */}
        <h1 className="text-4xl sm:text-[52px] font-bold text-white leading-[1.1] tracking-tight text-center mb-4">
          Reverse any SaaS.
          <br />
          <span className="text-lime-400">Build your version.</span>
        </h1>
        <p className="text-center font-mono text-sm text-zinc-500 mb-10 leading-relaxed">
          Enter a domain. Get features, stack, flows, and a prompt to build it.
        </p>

        {/* Input — sharp corners, brutalist */}
        <form onSubmit={analyze}>
          <div className="flex border border-[#1e1e1e] focus-within:border-lime-500 transition-colors duration-150 bg-[#0c0c0c]">
            <div className="flex items-center pl-4 text-zinc-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="notion, linear, stripe.com..."
              className="flex-1 bg-transparent px-3 py-4 text-white placeholder-zinc-700 focus:outline-none font-mono text-sm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <button
              type="submit"
              disabled={!domain.trim()}
              className="bg-lime-400 hover:bg-lime-300 text-black font-mono font-bold text-sm px-6 py-4 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              ANALYZE
            </button>
          </div>

          {/* URL hint — shows as you type */}
          <div className="h-6 mt-2 px-1">
            {urlHint && (
              <p className="font-mono text-xs text-zinc-600">
                saas-reverse.com/<span className="text-lime-500">{urlHint}</span>
              </p>
            )}
          </div>
        </form>

        {/* Example pills */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="font-mono text-xs text-zinc-700 uppercase tracking-widest">Try:</span>
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => router.push(`/${ex}`)}
              className="font-mono text-xs text-zinc-500 hover:text-zinc-200 border border-[#1a1a1a] hover:border-zinc-600 px-3 py-1.5 rounded-full transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* Blueprint preview */}
      <section className="max-w-2xl mx-auto px-6 pb-12">
        <div className="border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden">
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#141414] bg-[#0c0c0c]">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
            </div>
            <span className="font-mono text-xs text-zinc-600 ml-1">linear.app — blueprint preview</span>
          </div>

          {/* Fake output */}
          <div className="px-5 py-5 space-y-3">
            {PREVIEW_LINES.map((line, i) => {
              if (line.type === 'h2') return (
                <p key={i} className="font-mono text-xs text-lime-500 uppercase tracking-widest pt-2 border-t border-[#141414] first:border-0 first:pt-0">
                  ## {line.text}
                </p>
              );
              if (line.type === 'p') return (
                <p key={i} className="font-mono text-xs text-zinc-400 leading-relaxed">{line.text}</p>
              );
              if (line.type === 'li') return (
                <p key={i} className="font-mono text-xs text-zinc-500 leading-relaxed">
                  <span className="text-lime-600 mr-2">–</span>{line.text}
                </p>
              );
              if (line.type === 'stack') return (
                <div key={i} className="grid grid-cols-2 gap-1 mt-1">
                  {(line.items as string[][]).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-mono text-xs text-zinc-600 w-20 flex-shrink-0">{k}</span>
                      <span className="font-mono text-xs text-zinc-400">{v}</span>
                    </div>
                  ))}
                </div>
              );
              return null;
            })}
            <p className="font-mono text-xs text-zinc-700 pt-2">
              + build prompt, pages to build, user flows, data models...
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-2xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-3 gap-px bg-[#161616]">
          {[
            { n: '01', title: 'Enter a name', body: 'Type "notion" or "linear.app" — bare names resolve automatically.' },
            { n: '02', title: 'Scrape + analyze', body: 'Homepage, pricing, features — all pulled and analyzed in seconds.' },
            { n: '03', title: 'Get the blueprint', body: 'Stack, features, flows, and a build prompt ready to paste into Claude.' },
          ].map(item => (
            <div key={item.n} className="bg-[#080808] p-5">
              <div className="font-mono text-xs text-lime-500 mb-2">{item.n}</div>
              <div className="text-sm font-medium text-zinc-200 mb-1.5">{item.title}</div>
              <div className="font-mono text-xs text-zinc-600 leading-relaxed">{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently analyzed */}
      {recent.length > 0 && (
        <section className="max-w-2xl mx-auto px-6 pb-16">
          <p className="font-mono text-xs text-zinc-700 uppercase tracking-widest mb-3">
            Recently analyzed
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map(item => (
              <button
                key={item.domain}
                onClick={() => router.push(`/${item.domain}`)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-200 border border-[#1a1a1a] hover:border-zinc-600 px-3 py-1.5 rounded-full transition-colors"
              >
                {item.domain}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#111] px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-700">
            <TerminalIcon />
            <span className="font-mono text-xs">saas-reverse</span>
          </div>
          <p className="font-mono text-xs text-zinc-700">
            <a href="https://github.com/Badi21/saas-reverse" className="hover:text-zinc-400 transition-colors">open source</a>
            {' '}&middot;{' '}
            <a href="https://github.com/Badi21/saas-reverse/blob/main/LICENSE" className="hover:text-zinc-400 transition-colors">GPL-3.0</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
