import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewRedirect } from '../src/lib/preview-routing.ts';
import { includeDrafts, runWithDrafts } from '../src/lib/draft-scope.ts';

const anon = { editor: false, previewToken: false };
const pub = 'https://pub.example';

test('private staging requires an editor session even for preview links', () => {
  for (const path of ['/', '/products/marea', '/collections/bikinis', '/?_preview=example', '/_server-islands/product']) {
    const url = new URL(`https://p.example${path}`);
    assert.equal(previewRedirect(url, anon, undefined, true), 'https://p.example/_emdash/admin/login');
    assert.equal(previewRedirect(url, { editor: false, previewToken: true }, undefined, true), 'https://p.example/_emdash/admin/login');
    assert.equal(previewRedirect(url, { editor: true, previewToken: false }, undefined, true), null);
  }
});
test('private staging keeps login and CMS assets reachable without allowing lookalike paths', () => {
  for (const path of ['/_emdash/admin/login', '/_emdash/api/auth/passkey/options', '/_astro/login.js']) {
    assert.equal(previewRedirect(new URL(`https://p.example${path}`), anon, undefined, true), null);
  }
  assert.equal(previewRedirect(new URL('https://p.example/_emdash-other'), anon, undefined, true), 'https://p.example/_emdash/admin/login');
});

test('redirects anonymous visitors to the same path and query on the public site', () => {
  assert.equal(previewRedirect(new URL('https://p.example/products/marea?x=1'), anon, pub), 'https://pub.example/products/marea?x=1');
});
test('lets CMS and asset prefixes through', () => {
  for (const path of ['/_emdash/admin', '/_astro/a.js', '/_image', '/_server-islands/x']) {
    assert.equal(previewRedirect(new URL(`https://p.example${path}`), anon, pub), null, path);
  }
});
test('lets editors and token holders through', () => {
  const url = new URL('https://p.example/products/marea');
  assert.equal(previewRedirect(url, { editor: true, previewToken: false }, pub), null);
  assert.equal(previewRedirect(url, { editor: false, previewToken: true }, pub), null);
});
test('does not redirect without a public site url', () => {
  assert.equal(previewRedirect(new URL('https://p.example/'), anon, undefined), null);
});
test('draft scope is request-local and false outside a scope', () => {
  assert.equal(includeDrafts(), false);
  assert.equal(runWithDrafts(true, () => includeDrafts()), true);
  assert.equal(runWithDrafts(false, () => includeDrafts()), false);
});
