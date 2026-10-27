import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shopSource } from '../src/lib/shop/source.ts';
import { runWithDrafts } from '../src/lib/draft-scope.ts';

test('public mode reads the snapshot, never live content', () => {
  assert.deepEqual(shopSource('public'), { live: false, drafts: false });
  assert.deepEqual(runWithDrafts(true, () => shopSource('public')), { live: false, drafts: false });
});
test('dev mode is live with drafts even outside a request scope', () => {
  assert.deepEqual(shopSource('dev'), { live: true, drafts: true });
});
test('preview mode is live and follows the request draft scope', () => {
  assert.deepEqual(shopSource('preview'), { live: true, drafts: false });
  assert.deepEqual(runWithDrafts(true, () => shopSource('preview')), { live: true, drafts: true });
  assert.deepEqual(runWithDrafts(false, () => shopSource('preview')), { live: true, drafts: false });
});
