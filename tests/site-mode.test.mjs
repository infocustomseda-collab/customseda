import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siteMode, canPreviewDrafts, draftsVisible, registersServiceWorker } from '../src/lib/site-mode.ts';

test('dev runtime wins over the configured mode', () => {
  assert.equal(siteMode(true, 'preview'), 'dev');
});
test('only the exact preview value selects preview mode', () => {
  assert.equal(siteMode(false, 'preview'), 'preview');
  assert.equal(siteMode(false, undefined), 'public');
  assert.equal(siteMode(false, 'PREVIEW'), 'public');
});
test('editors need role 20 or higher to preview drafts', () => {
  assert.equal(canPreviewDrafts(undefined), false);
  assert.equal(canPreviewDrafts(10), false);
  assert.equal(canPreviewDrafts(20), true);
});
test('drafts are visible only in dev, or in preview for editors or preview-token holders', () => {
  assert.equal(draftsVisible('public', { editor: true, previewToken: true }), false);
  assert.equal(draftsVisible('preview', { editor: false, previewToken: false }), false);
  assert.equal(draftsVisible('preview', { editor: true, previewToken: false }), true);
  assert.equal(draftsVisible('preview', { editor: false, previewToken: true }), true);
  assert.equal(draftsVisible('dev', { editor: false, previewToken: false }), true);
});

test('service worker registers only in public production builds', () => {
  assert.equal(registersServiceWorker('preview', true), false);
  assert.equal(registersServiceWorker('public', true), true);
  assert.equal(registersServiceWorker('dev', false), false);
  assert.equal(registersServiceWorker('public', false), false);
});
