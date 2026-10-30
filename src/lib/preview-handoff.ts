import { createHash, randomBytes } from 'node:crypto';
import type { OptionsRepository } from 'emdash';

type Store = Pick<OptionsRepository, 'setVersioned' | 'getVersioned' | 'compareAndDelete'>;
type Handoff = { sessionId: string; path: string; expires: number };
export const handoffKey = (token: string) => `customseda.preview.${createHash('sha256').update(token).digest('hex')}`;
export function previewPath(path: string): string {
 if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) return '/';
 const url=new URL(path,'https://preview.invalid');
 if (['/_emdash','/preview','/api','/checkout'].some(p=>url.pathname===p||url.pathname.startsWith(`${p}/`))) return '/';
 return url.pathname+url.search;
}
export async function issuePreviewHandoff(store: Store, sessionId: string, path: string, now=Date.now()): Promise<string> {
 const token=randomBytes(32).toString('hex');
 await store.setVersioned(handoffKey(token),{sessionId,path:previewPath(path),expires:now+60_000});
 return token;
}
export async function consumePreviewHandoff(store: Store, token: string, now=Date.now()): Promise<{sessionId:string;path:string}|null> {
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const key=handoffKey(token);const row=await store.getVersioned<Handoff>(key);
 if(!row)return null;
 const removed=await store.compareAndDelete(key,row.revision);
 if(!removed.applied||row.value.expires<=now)return null;
 return {sessionId:row.value.sessionId,path:previewPath(row.value.path)};
}
