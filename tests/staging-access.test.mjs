import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stagingAccess } from '../src/lib/staging-access.ts';

const env = { FOUNDATION_ACCESS_TOKEN: 'a'.repeat(64), CMS_ORIGIN: 'https://cms.example' };
const req = (path, auth) => new Request(`https://staging.example${path}`, { headers: auth ? { Authorization: auth } : {} });
const basic = (user, pass) => `Basic ${btoa(`${user}:${pass}`)}`;

test('editor session sees drafts without Basic', () => assert.deepEqual(stagingAccess(req('/'), env, true), { drafts: true }));
test('Basic reviewer sees drafts', () => assert.deepEqual(stagingAccess(req('/', basic('seda', env.FOUNDATION_ACCESS_TOKEN)), env, false), { drafts: true }));
test('anonymous, wrong user, wrong token and preview links get a private 401 Basic challenge linking to the CMS login', async () => {
  for (const r of [req('/'), req('/?_preview=x'), req('/', basic('Seda', env.FOUNDATION_ACCESS_TOKEN)), req('/', basic('seda', 'wrong')), req('/', basic(' seda', env.FOUNDATION_ACCESS_TOKEN))]) {
    const res = stagingAccess(r, env, false);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('WWW-Authenticate'), /^Basic /);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.match(await res.text(), /https:\/\/cms\.example\/_emdash\/admin\/login/);
  }
});
test('handoff, webhook, build assets and media are exempt, without drafts', () => {
  for (const p of ['/preview/access', '/api/stripe/webhook', '/_astro/a.js', '/_emdash/api/media/file/k.webp']) assert.deepEqual(stagingAccess(req(p), env, false), { drafts: false }, p);
  for (const p of ['/preview/accessx', '/api/stripe/webhookx', '/_emdash/api/media/files']) assert.equal(stagingAccess(req(p), env, false).status, 401, p);
});
test('missing token never grants access', () => assert.equal(stagingAccess(req('/', basic('seda', 'undefined')), { CMS_ORIGIN: env.CMS_ORIGIN }, false).status, 401));
