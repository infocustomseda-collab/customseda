import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handoffKey } from '../../lib/preview-handoff.ts';
export const prerender=false;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
export const GET: APIRoute=async()=>{
 if(!(env as unknown as {CMS_ORIGIN?:string}).CMS_ORIGIN)return new Response(null,{status:404});
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Opening preview</title><p id="status">Opening your preview…</p><script>
 const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).then(async r=>{if(!r.ok)throw Error('This preview link has expired. Open View Site in the production CMS again.');const d=await r.json();location.replace(d.path)}).catch(e=>document.getElementById('status').textContent=e.message);
 </script></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
};
export const POST: APIRoute=async({request,url,session})=>{
 if(!(env as unknown as {CMS_ORIGIN?:string}).CMS_ORIGIN)return new Response(null,{status:404});
 if(request.headers.get('origin')!==url.origin||!session)return new Response(null,{status:403,headers});
 const body:unknown=await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||!('token' in body)||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return new Response(null,{status:403,headers});
 const row=await env.DB.prepare("DELETE FROM options WHERE name = ? AND json_extract(value, '$.expires') > ? RETURNING value").bind(handoffKey(body.token),Date.now()).first<{value:string}>();
 if(!row)return new Response(null,{status:403,headers});
 const ticket=JSON.parse(row.value) as {sessionId:string;path:string};
 await session.load(ticket.sessionId);
 const user=await session.get<{id:string}>('user');
 if(!user?.id){session.destroy();return new Response(null,{status:403,headers});}
 const editor=await env.DB.prepare('SELECT role, disabled FROM users WHERE id = ?').bind(user.id).first<{role:number;disabled:number}>();
 if(!editor||editor.role<20||editor.disabled){session.destroy();return new Response(null,{status:403,headers});}
 return Response.json({path:ticket.path},{headers});
};
