import assert from 'node:assert/strict';
import { test } from 'node:test';
import { includeDrafts, runWithDrafts } from '../src/lib/draft-scope.ts';

test('draft scope is request-local and false outside a scope', () => {
  assert.equal(includeDrafts(), false);
  assert.equal(runWithDrafts(true, () => includeDrafts()), true);
  assert.equal(runWithDrafts(false, () => includeDrafts()), false);
});
