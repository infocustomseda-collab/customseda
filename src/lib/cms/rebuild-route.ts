import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { rebuildConfig, rebuildRequestAllowed, requestRebuild } from '../publish/rebuild.ts';
export const prerender=false;
// Menu edits have no EmDash hook: administrators rebuild on demand after changing menus.
export const POST:APIRoute=async ({request,url,locals})=>{
 if(!rebuildRequestAllowed({role:locals.user?.role??0,origin:url.origin,requestOrigin:request.headers.get('origin'),csrf:request.headers.get('x-emdash-request')})) return Response.json({error:'Administrator required.'},{status:403});
 const config=rebuildConfig(env as unknown as Record<string,unknown>);
 if(!config) return Response.json({error:'Rebuilds are not configured for this environment.'},{status:503});
 try {await requestRebuild(config,'manual rebuild');}
 catch(error) {console.error('Rebuild request failed',error);return Response.json({error:'GitHub refused the rebuild request.'},{status:502});}
 return Response.json({success:true,data:{environment:config.environment}});
};
