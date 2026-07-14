import Groq from 'groq-sdk';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface SiteMeta {
  title: string;
  description: string;
}

const SYSTEM_PROMPT = `You are a venture-analyst who reverse-engineers SaaS products for builders who want to recreate or compete with them.

Rules:
- Specific over vague. Never say "a platform that helps users." Say "project management for async remote teams at $8/seat/month."
- Use real numbers from the content when visible.
- Distinguish what you saw ([SEEN]) from what you inferred ([INFERRED]).
- Moat analysis must be honest, most SaaS have weak moats. Say so.
- Churn vectors must come from real signals in the content, not generic guesses.
- Build prompt must be complete enough to paste directly into an AI coding assistant and start building.`;

const CORE_SECTIONS = `## What it does
2-3 specific sentences. Actual product behavior, not taglines. Include price if visible.

## Target users
Role + company size + trigger moment (when does someone first need this?). Example: "Engineering managers at 10-50 person startups who've outgrown GitHub Issues. Trigger: team grows past 8 engineers."

## Core features
10-18 features as a markdown table:
| Feature | Type | Description |
|---------|------|-------------|
Type = Core / Differentiator / Table stakes

## Business model
- Free tier: what's included and the hard limit
- Paid tiers: name + price + what unlocks (use [SEEN] if on the page, [INFERRED] if guessed)
- Upgrade gate: the exact friction that converts free to paid
- Trial mechanics: days, card required?
- Enterprise signals: SSO, audit logs, SLA?`;

const STRATEGY_SECTIONS = `## Moat analysis
For each: Strong / Moderate / Weak / None + one-line evidence
- Network effects:
- Switching costs:
- Data advantage:
- Brand/community:
- Integrations:

## Churn vectors
Top 3 reasons users would leave. Infer from feature gaps, pricing structure, or missing capabilities visible in the content. Label each [SEEN] or [INFERRED].

## Differentiation angle
If building a competitor:
- Underserved segment the incumbent ignores
- One feature that would win switchers
- Pricing angle that works in a niche
- What the incumbent will never build (and why)`;

const TECH_SECTIONS = `## Tech stack
Markdown table with Layer / Stack / Confidence ([SEEN] in HTML/headers, [INFERRED] from patterns):
Frontend, Backend, Database, Auth, Payments, Infrastructure, Analytics

## Build complexity
Estimate in days for a 2-person team:
- Data model + migrations: X days
- Auth + team/org structure: X days
- Core feature loop: X days
- Payments/billing: X days
- **MVP total: X weeks**

## Pages to build
All pages including app views, not just marketing pages.

## Core user flows
Three numbered flows:
1. Onboarding (include drop-off risks)
2. Daily core action (the habit loop)
3. Upgrade moment (exact trigger)`;

const BUILD_PROMPT_SECTION = `## Build prompt
Complete prompt to paste into Claude Code or Cursor. Must include: product description, target user, full feature list with behaviors, data models as TypeScript types, all pages, three user flows, business rules (free tier limits, upgrade gates), and tech stack. Start with: "Build a [type] SaaS..."`;

function analysisPrompt(domain: string, meta: SiteMeta, content: string, sections: string): string {
  return `Analyze this SaaS.

Domain: ${domain}
${meta.title ? `Title: ${meta.title}` : ''}
${meta.description ? `Meta description: ${meta.description}` : ''}

Scraped content:
${content}

---

Output ONLY these sections, in this exact order and format:

${sections}`;
}

function buildPromptSynthesisPrompt(domain: string, meta: SiteMeta, content: string, analysis: string): string {
  return `Here is a venture-analyst breakdown of ${domain} written by another analyst:

${analysis}

---

Original scraped content, for anything the breakdown above didn't cover:
${content}

---

Using that breakdown, output ONLY this section. Keep it consistent with the features, business model, and tech stack already described above, don't contradict them:

${BUILD_PROMPT_SECTION}`;
}

async function runAgent(groq: Groq, userPrompt: string, maxTokens: number): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: maxTokens,
  });
  return completion.choices[0]?.message?.content?.trim() || '';
}

// Two-wave pipeline instead of one giant sequential completion. Wave one
// runs three focused agents in parallel (product/business, strategy,
// tech/build) so wall-clock time is roughly the slowest of the three, not
// their sum, and each prompt is narrow enough that the model has less room
// to wander. Wave two synthesizes the final build prompt from wave one's
// output, so it doesn't contradict the sections it's supposed to summarize.
export async function runAnalysisPipeline(
  apiKey: string,
  domain: string,
  meta: SiteMeta,
  content: string
): Promise<string> {
  const groq = new Groq({ apiKey });

  const [core, strategy, tech] = await Promise.all([
    runAgent(groq, analysisPrompt(domain, meta, content, CORE_SECTIONS), 1400),
    runAgent(groq, analysisPrompt(domain, meta, content, STRATEGY_SECTIONS), 700),
    runAgent(groq, analysisPrompt(domain, meta, content, TECH_SECTIONS), 1100),
  ]);

  const analysis = [core, strategy, tech].join('\n\n');
  const buildPrompt = await runAgent(groq, buildPromptSynthesisPrompt(domain, meta, content, analysis), 1300);

  return [analysis, buildPrompt].join('\n\n');
}
