'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const rawDomain = decodeURIComponent(params.domain as string);

  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [resolvedDomain, setResolvedDomain] = useState(rawDomain);
  const outputRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setLoading(true);
    setOutput('');
    setError('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: rawDomain }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Something went wrong.');
        setLoading(false);
        return;
      }

      // Read resolved domain from header if server sent it
      const resolved = res.headers.get('x-resolved-domain');
      if (resolved) setResolvedDomain(resolved);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput(prev => prev + decoder.decode(value, { stream: true }));
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } catch {
      setError('Failed to reach the server.');
    } finally {
      setLoading(false);
    }
  }

  async function copyBlueprint() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-[#080808]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[#141414] flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="text-sm font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          saas-reverse
        </button>
        <a
          href="https://github.com/Badi21/saas-reverse"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-700 hover:text-zinc-400 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          GitHub
        </a>
      </header>

      <div className="max-w-2xl mx-auto px-6 pt-8 pb-24">
        {/* Domain label + re-analyze */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-lime-400 flex-shrink-0" />
            <span className="font-mono text-sm text-zinc-300">{resolvedDomain}</span>
          </div>
          <button
            onClick={() => { started.current = false; run(); }}
            disabled={loading}
            className="text-xs text-zinc-600 hover:text-zinc-400 border border-[#1e1e1e] hover:border-[#333] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            Re-analyze
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800/40 text-red-400 px-4 py-3 rounded-xl text-sm mb-6">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !output && (
          <div className="space-y-3">
            {[80, 60, 90, 50, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 bg-[#141414] rounded animate-pulse"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        )}

        {/* Output */}
        {output && (
          <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#151515]">
              <span className="text-xs text-zinc-600 font-mono">blueprint</span>
              {!loading && (
                <button
                  onClick={copyBlueprint}
                  className="text-xs text-zinc-500 hover:text-zinc-200 border border-[#1e1e1e] hover:border-[#333] px-3 py-1.5 rounded-lg transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy blueprint'}
                </button>
              )}
            </div>
            <div className="px-6 py-6" ref={outputRef}>
              <div className="prose-blueprint max-w-none text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                {loading && <span className="cursor-blink" />}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
