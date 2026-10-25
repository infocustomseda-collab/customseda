import { env } from 'cloudflare:workers';
import { after } from 'emdash';
import { getDb } from 'emdash/runtime';
import { rebuildConfig, requestRebuild } from '../publish/rebuild.ts';
import { createCatalogPolicy } from './policy.ts';
export function createPlugin() {
 return createCatalogPolicy(getDb,{onContentChange:reason=>{
  const config=rebuildConfig(env as unknown as Record<string,unknown>);
  // Never delays or fails the editor's request; a failed dispatch is logged.
  if(config) after(()=>requestRebuild(config,reason).catch(error=>console.error('Rebuild request failed',error)));
 }});
}
