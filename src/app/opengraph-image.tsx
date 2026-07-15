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
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          padding: '90px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: '1px solid #a3e635',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a3e635',
              fontSize: 22,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {'>_'}
          </div>
          <div style={{ color: '#a3e635', fontSize: 30, fontFamily: 'monospace', fontWeight: 700 }}>
            saas-reverse
          </div>
        </div>
        <div
          style={{
            color: '#f0f0f0',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.12,
            textAlign: 'center',
          }}
        >
          Reverse any SaaS.
        </div>
        <div
          style={{
            color: '#a3e635',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.12,
            marginBottom: 36,
            textAlign: 'center',
          }}
        >
          Build your version.
        </div>
        <div style={{ color: '#71717a', fontSize: 30, textAlign: 'center', maxWidth: 780 }}>
          Enter a domain. Get features, stack, flows, and a prompt to build it.
        </div>
      </div>
    ),
    { ...size }
  );
}
