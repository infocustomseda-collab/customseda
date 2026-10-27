import type {MiddlewareHandler} from 'astro';
import { catalogTypes } from './catalog.ts';
import { readCatalogEntry, validateCatalogWrite, type CatalogWrite } from './catalog-store.ts';

export const catalogWriteMiddleware:MiddlewareHandler=async ({request,url,locals},next)=>{
 // Native taxonomy assignments are immediate; protect published entries and used sizes.
 const assignment=url.pathname.match(/^\/_emdash\/api\/content\/(products|sizes)\/([^/]+)\/terms\/category\/?$/);
 if(assignment && request.method==='POST' && locals.user && locals.user.role>=20) {
  const parsed:unknown=await request.clone().json().catch(()=>null);
  const termIds=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?(parsed as Record<string,unknown>).termIds:null;
  if(Array.isArray(termIds) && termIds.every((id:unknown):id is string=>typeof id==='string')) {
   const type=assignment[1]!,id=decodeURIComponent(assignment[2]!);
   const entry=await readCatalogEntry(locals.emdash.db,type,id,false);
   if(entry && (entry.status==='published' || type==='sizes')) {
    const terms=termIds.length?await locals.emdash.db.selectFrom('taxonomies').select(['id','translation_group']).where('name','=','category').where('id','in',termIds).execute():[];
    const selected=termIds.map((id:string)=>terms.find(term=>term.id===id)?.translation_group??id);
    const errors=await validateCatalogWrite(locals.emdash.db,type,id,{references:{category:selected}},{publish:entry.status==='published'});
    if(errors.length)return Response.json({success:false,error:{code:'VALIDATION_ERROR',message:errors.join(' ')}},{status:400});
   }
  }
  return next();
 }
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
