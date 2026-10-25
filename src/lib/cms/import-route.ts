import type {APIRoute} from 'astro';
import {applyShopifySourceSchema,importRequestAllowed,importShopifyDraft,type ShopifyDraftInput} from './shopify-import.ts';
export const prerender=false;
export const POST:APIRoute=async ({request,url,locals})=>{
 if(!import.meta.env.DEV) return new Response(null,{status:404});
 if(!importRequestAllowed({dev:true,hostname:url.hostname,role:locals.user?.role??0,origin:url.origin,requestOrigin:request.headers.get('origin'),csrf:request.headers.get('x-emdash-request')})) return Response.json({error:'Local same-origin administrator required.'},{status:403});
 try {
  const input=await request.json() as ShopifyDraftInput&{operation?:string};
  if(input.operation==='schema') {await applyShopifySourceSchema(locals.emdash.db);return Response.json({success:true,data:{ready:true}});}
  if(!input.data||typeof input.data!=='object'||Array.isArray(input.data)) throw new Error('Invalid draft payload.');
  const result=await importShopifyDraft(locals.emdash.db,(collection,body)=>locals.emdash.handleContentCreate(collection,{...body,authorId:locals.user!.id,actor:{id:locals.user!.id,role:locals.user!.role}}),input);
  return Response.json({success:true,data:result});
 } catch(error) {return Response.json({success:false,error:{message:error instanceof Error?error.message:'Import failed.'}},{status:400});}
};
