import type {MiddlewareHandler} from 'astro';
import { catalogTypes } from './catalog.ts';
import { validateCatalogWrite, type CatalogWrite } from './catalog-store.ts';

export const catalogWriteMiddleware:MiddlewareHandler=async ({request,url,locals},next)=>{
 const match=url.pathname.match(/^\/_emdash\/api\/content\/([a-z_]+)(?:\/([^/]+))?\/?$/);
 if(!match || !['POST','PUT','PATCH'].includes(request.method) || !catalogTypes.has(match[1]!) || !locals.user || locals.user.role<20) return next();
 const parsed:unknown=await request.clone().json().catch(()=>null);
 if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return next();
 const body=parsed as Record<string,unknown>;
 if(!body || typeof body!=='object' || Array.isArray(body)) return next();
 // Invalid payload shapes are rejected by EmDash's parser, before our business rules.
 if(body.data!==undefined && (!body.data||typeof body.data!=='object'||Array.isArray(body.data))) return next();
 if(body.references!==undefined && (!body.references||typeof body.references!=='object'||Array.isArray(body.references)||Object.values(body.references).some(ids=>!Array.isArray(ids)||ids.some(id=>typeof id!=='string')))) return next();
 const errors=await validateCatalogWrite(locals.emdash.db,match[1]!,match[2]?decodeURIComponent(match[2]):undefined,body as CatalogWrite);
 if(errors.length) return Response.json({success:false,error:{code:'VALIDATION_ERROR',message:errors.join(' ')}},{status:400});
 return next();
};
