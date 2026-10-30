import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { OptionsRepository } from 'emdash';
import { issuePreviewHandoff, previewPath } from '../preview-handoff.ts';
export const prerender=false;
export const GET: APIRoute=async({locals,session,url})=>{
 const target=(env as unknown as {SSR_PREVIEW_URL?:string}).SSR_PREVIEW_URL;
 if(!target)return new Response(null,{status:404});
 const sessionUser=await session?.get<{id:string}>('user');
 if(!locals.user||locals.user.role<20||sessionUser?.id!==locals.user.id||!session?.sessionID)return new Response('Sign in as an editor first.',{status:403});
 const options=new OptionsRepository(locals.emdash.db);
 // Abandoned tickets expire after one minute; collect them on the next handoff.
 await env.DB.prepare("DELETE FROM options WHERE name LIKE 'customseda.preview.%' AND json_extract(value, '$.expires') <= ?").bind(Date.now()).run();
 const token=await issuePreviewHandoff(options,session.sessionID,previewPath(url.searchParams.get('path')??'/'));
 const destination=new URL('/preview/access',target);destination.hash=token;
 return new Response(null,{status:303,headers:{Location:destination.toString(),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
};
