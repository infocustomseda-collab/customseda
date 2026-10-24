import { OptionsRepository, SchemaRegistry } from 'emdash';
import { applySeed, validateSeed, type SeedFile } from 'emdash/seed';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import type { CatalogDb } from './catalog-store.ts';

export const modelVersion='customseda.catalog.v1';
export async function applyCatalogModel(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(modelVersion)) return {version:modelVersion,applied:false};
 const seed=seedJson as SeedFile;
 const validation=validateSeed(seed);
 if(!validation.valid) throw new Error(validation.errors.join('\n'));
 // Schema is versioned application code; upsert its fields so an interrupted
 // install can resume. Editorial entries are applied separately with skip.
 const {content,...schema}=seed;
 await applySeed(db,{...schema,collections:schema.collections?.map(collection=>({...collection,fields:[]}))},{includeContent:false,onConflict:'skip'});
 const result=await applySeed(db,schema,{includeContent:false,onConflict:'update'});
 const lookups=await applySeed(db,{version:'1',content},{includeContent:true,onConflict:'skip'});
 const registry=new SchemaRegistry(db);
 if(await registry.getCollection('posts')) await registry.updateCollection('posts',{hidden:true});
 await options.set(modelVersion,{appliedAt:new Date().toISOString()});
 return {version:modelVersion,applied:true,result,lookups};
}
