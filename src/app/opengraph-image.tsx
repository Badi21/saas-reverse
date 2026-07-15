import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: '#080808',
          backgroundImage: 'radial-gradient(#1c1c1c 2px, transparent 2px)',
          backgroundSize: '36px 36px',
          padding: '90px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#0a0a0a',
              border: '1px solid #1e1e1e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a3e635',
              fontSize: 28,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {'>_'}
          </div>
          <div style={{ color: '#71717a', fontSize: 28, fontFamily: 'monospace' }}>saas-reverse</div>
        </div>
        <div
          style={{
            color: '#f0f0f0',
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 950,
          }}
        >
          Reverse any SaaS.
        </div>
        <div
          style={{
            color: '#a3e635',
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: 32,
          }}
        >
          Build your version.
        </div>
        <div style={{ color: '#71717a', fontSize: 30, maxWidth: 800 }}>
          Enter a domain. Get features, pricing, moat, tech stack, and a build prompt.
        </div>
      </div>
    ),
    { ...size }
  );
}
