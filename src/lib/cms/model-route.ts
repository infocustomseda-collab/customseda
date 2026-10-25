import type { APIRoute } from 'astro';
import { applyModelMigrations, modelVersions } from './model-migration.ts';
export const prerender=false;
export const POST:APIRoute=async ({request,url,locals})=>{
 // Schema DDL is deliberately unavailable in deployed Worker requests.
 if(!import.meta.env.DEV) return new Response(null,{status:404});
 if(!locals.user || locals.user.role<50) return Response.json({error:'Administrator required.'},{status:403});
 if(request.headers.get('origin')!==url.origin || request.headers.get('x-emdash-request')!=='1') return Response.json({error:'Same-origin request required.'},{status:403});
 const results=await applyModelMigrations(locals.emdash.db);
 return Response.json({success:true,data:{version:modelVersions.at(-1),applied:results.some(r=>r.applied),results}});
};
