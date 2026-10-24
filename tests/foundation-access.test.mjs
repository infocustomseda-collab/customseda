import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foundationAccess } from '../src/lib/foundation-access.ts';

const request = (password) => new Request('https://staging.example/_emdash/admin', {
  headers: password ? { Authorization: `Basic ${btoa(`seda:${password}`)}` } : {},
});
const secret = 'a'.repeat(64);

test('local unlocked runtime passes through', () => {
  assert.equal(foundationAccess(request(), { FOUNDATION_LOCKED: 'false' }), null);
});
test('locked runtime fails closed when its secret is missing', () => {
  assert.equal(foundationAccess(request(), { FOUNDATION_LOCKED: 'true' }).status, 503);
});
test('locked runtime challenges missing, wrong and malformed credentials', () => {
  const env = { FOUNDATION_LOCKED: 'true', FOUNDATION_ACCESS_TOKEN: secret };
  for (const req of [request(), request('wrong'), new Request('https://staging.example', { headers: { Authorization: 'Basic ???' } })]) {
    const response = foundationAccess(req, env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('WWW-Authenticate'), /Basic/);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
test('correct foundation credentials pass through without replacing CMS authentication', () => {
  assert.equal(foundationAccess(request(secret), { FOUNDATION_LOCKED: 'true', FOUNDATION_ACCESS_TOKEN: secret }), null);
});
