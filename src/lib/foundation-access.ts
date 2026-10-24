import { timingSafeEqual } from 'node:crypto';

interface FoundationEnvironment {
  FOUNDATION_LOCKED?: string;
  FOUNDATION_ACCESS_TOKEN?: string;
}

/** Temporary deployment gate: protects the unclaimed setup wizard, not a CMS login. */
export function foundationAccess(request: Request, env: FoundationEnvironment): Response | null {
  if (env.FOUNDATION_LOCKED !== 'true') return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!env.FOUNDATION_ACCESS_TOKEN) return new Response('Foundation access is not configured.', { status: 503, headers });
  const expected = `Basic ${btoa(`seda:${env.FOUNDATION_ACCESS_TOKEN}`)}`;
  const actual = request.headers.get('Authorization') ?? '';
  const encoder = new TextEncoder();
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return null;
  return new Response('Private deployment verification.', {
    status: 401,
    headers: { ...headers, 'WWW-Authenticate': 'Basic realm="Custom Seda foundation", charset="UTF-8"' },
  });
}
