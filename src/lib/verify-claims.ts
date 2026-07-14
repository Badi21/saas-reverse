export interface ClaimCheck {
  claim: string;
  verified: boolean;
}

const NUMERIC_CLAIM = /\$\d[\d,.]*(?:\/(?:mo|month|seat|user|yr|year))?|\b\d+(?:\.\d+)?%/gi;

// Pulls dollar amounts and percentages out of lines tagged [SEEN] and checks
// whether that exact figure shows up in the scraped source text. Lines
// tagged [SEEN] with no checkable number are left alone - too fuzzy to
// verify without a second LLM call, and missing a check beats false-flagging
// a real observation.
export function verifySeenClaims(output: string, sourceContent: string): ClaimCheck[] {
  const normalizedSource = sourceContent.toLowerCase().replace(/\s+/g, '');
  const checks: ClaimCheck[] = [];

  for (const line of output.split('\n')) {
    if (!line.includes('[SEEN]')) continue;
    const numbers = line.match(NUMERIC_CLAIM);
    if (!numbers) continue;
    for (const num of numbers) {
      const needle = num.toLowerCase().replace(/\s+/g, '');
      checks.push({ claim: num, verified: normalizedSource.includes(needle) });
    }
  }
  return checks;
}
