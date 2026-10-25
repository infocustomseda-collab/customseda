import { OptionsRepository, SchemaRegistry } from 'emdash';
import { applySeed, validateSeed, type SeedFile } from 'emdash/seed';
import seedJson from '../../../seed/seed.json' with {type:'json'};
import storefrontJson from '../../../seed/storefront.json' with {type:'json'};
import type { CatalogDb } from './catalog-store.ts';
import { applyCheckoutModel, checkoutVersion } from '../commerce/payments.ts';

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

// Homepage sections on site settings. A separate seed keeps the applied v1 seed unchanged;
// applySeed's update mode upserts only the fields it names, so import-only fields survive.
export const storefrontVersion='customseda.storefront.v1';
export async function applyStorefrontModel(db:CatalogDb) {
 const options=new OptionsRepository(db);
 if(await options.get(storefrontVersion)) return {version:storefrontVersion,applied:false};
 const seed=storefrontJson as SeedFile;
 const validation=validateSeed(seed);
 if(!validation.valid) throw new Error(validation.errors.join('\n'));
 const result=await applySeed(db,seed,{includeContent:false,onConflict:'update'});
 await options.set(storefrontVersion,{appliedAt:new Date().toISOString()});
 return {version:storefrontVersion,applied:true,result};
}

/** Every application model version, in order. Deployment and the local route call this. */
export const modelVersions=[modelVersion,storefrontVersion,checkoutVersion];
export async function applyModelMigrations(db:CatalogDb) {
 return [await applyCatalogModel(db),await applyStorefrontModel(db),await applyCheckoutModel(db)];
}
