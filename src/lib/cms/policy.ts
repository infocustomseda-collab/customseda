import { ContentSaveRejectedError, definePlugin } from 'emdash';
import { removalAllowed, validateCatalogWrite, type CatalogDb } from './catalog-store.ts';

export function createCatalogPolicy(getDatabase:()=>CatalogDb|Promise<CatalogDb>) {
 const publication=async (event:{collection:string;content:Record<string,unknown>})=>{
  const id=String(event.content.id??'');
  const errors=await validateCatalogWrite(await getDatabase(),event.collection,id,{}, {publish:true});
  if(errors.length) return {cancel:true as const,reason:errors.join(' ')};
 };
 return definePlugin({
  id:'customseda-catalog',version:'0.1.0',
  capabilities:['content:read','content:write','hooks.content-policy:register'],
  hooks:{
   'content:beforeSave':{errorPolicy:'abort',handler:async event=>{
    // beforeSave has no pending reference payload. REST middleware checks that
    // selection; publication policies recheck staged references for every writer.
    const errors=await validateCatalogWrite(await getDatabase(),event.collection,event.id,{data:event.content},{checkReferences:false});
    if(errors.length) throw new ContentSaveRejectedError(errors.join(' '));
    if(event.isNew && ['products','conjuntos'].includes(event.collection) && event.content.available===undefined) return {...event.content,available:true};
   }},
   'content:beforePublish':{errorPolicy:'abort',handler:publication},
   'content:beforeSchedule':{errorPolicy:'abort',handler:publication},
   'content:beforeUnpublish':{errorPolicy:'abort',handler:async event=>{
    if(!await removalAllowed(await getDatabase(),event.collection,String(event.content.id))) return {cancel:true,reason:'Este contenido está vinculado. Desvincúlalo antes de retirarlo.'};
   }},
   'content:beforeDelete':{errorPolicy:'abort',handler:async event=>removalAllowed(await getDatabase(),event.collection,event.id)},
  },
 });
}
