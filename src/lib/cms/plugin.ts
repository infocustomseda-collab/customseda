import { getDb } from 'emdash/runtime';
import { createCatalogPolicy } from './policy.ts';
export function createPlugin() { return createCatalogPolicy(getDb); }
