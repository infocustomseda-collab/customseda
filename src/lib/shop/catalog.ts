// One product catalog. Native taxonomy terms classify both pieces and bundles.
import type { ShopContent, ShopEntry } from "./content.ts";
import { productCard } from "./site.ts";
import { orderSizes } from "./view.ts";
import { filterItems, type CatalogItem } from "./filters.ts";
export * from "./filters.ts";
type Lookups = Pick<ShopContent, "categories" | "collections" | "colors" | "sizes" | "products">;
const code = (entries: ShopEntry[], id: string | undefined) => {
 const value = entries.find(entry => entry.id === id)?.data.code;
 return typeof value === "string" ? value : null;
};
export function buildCatalog(shop: Lookups): CatalogItem[] {
 const piece = (entry: ShopEntry) => ({
  entry, color: code(shop.colors,entry.refs.color?.[0]), collection: code(shop.collections,entry.refs.collection?.[0]),
  sizes: orderSizes((entry.refs.sizes??[]).flatMap(id=>code(shop.sizes,id)??[])), available: entry.data.available!==false,
 });
 const pieces = new Map(shop.products.filter(entry=>entry.data.bundle!==true).map(entry=>[entry.id,piece(entry)]));
 return shop.products.flatMap((entry): CatalogItem[] => {
  const bundle=entry.data.bundle===true;
  const components=(entry.refs.components??[]).map(id=>pieces.get(id));
  if(bundle && (components.length<2 || components.some(component=>!component))) return [];
  const included=components.filter((component): component is ReturnType<typeof piece> => !!component);
  const own=piece(entry);
  const available=own.available && (!bundle || included.every(component=>component.available));
  const category=shop.categories.find(term=>term.id===entry.refs.category?.[0]);
  const categories:string[]=[];
  const seen=new Set<string>();
  for(let term=category;term&&!seen.has(term.id);term=shop.categories.find(parent=>parent.id===term!.data.parent)) {
   seen.add(term.id); categories.push(String(term.data.code));
  }
  // A mixed-color bundle has no implied single color. This is display derivation, not validation.
  const shared = (field: 'color'|'collection') => included.length && included.every(component=>component[field]===included[0]![field]) ? included[0]![field] : null;
  const color=own.color ?? (bundle?shared('color'):null);
  const collection=own.collection ?? (bundle?shared('collection'):null);
  const colorLabel=shop.colors.find(value=>value.data.code===color)?.data.title;
  const metadata=[category?.data.title,colorLabel].filter(Boolean).join(' · ');
  return [{id:entry.id,slug:entry.slug,kind:bundle?'bundle':'pieza',category:category?String(category.data.code):null,categories,
   title:String(entry.data.title??''),price:Number(entry.data.price_cents??0),available,color,collection,
   sizes:bundle?orderSizes(included.flatMap(component=>component.sizes)):own.sizes,
   card:{...productCard(entry),available,metadata},
  }];
 });
}
/** Flatten the native tree in sibling order for category navigation. */
export function categoryOptions(terms:ShopEntry[]):ShopEntry[] {
 const ordered:ShopEntry[]=[];
 const visited=new Set<string>();
 const append=(term:ShopEntry)=>{
  if(visited.has(term.id))return;
  visited.add(term.id);ordered.push(term);
  for(const child of terms.filter(child=>child.data.parent===term.id))append(child);
 };
 for(const term of terms.filter(term=>!term.data.parent))append(term);
 for(const term of terms)append(term);
 return ordered;
}
export type CatalogView = { handle:string; title:string; category?:string; scope?:string; description?:unknown; items:(all:CatalogItem[])=>CatalogItem[] };
export function catalogViews(shop:Pick<ShopContent,'collections'|'categories'>):CatalogView[] {
 const views:CatalogView[]=[{handle:'bikinis',title:'Bikinis',scope:'mujeres',items:all=>filterItems(all,{category:'mujeres',colors:[],available:false})},
  ...categoryOptions(shop.categories).map(term=>({handle:term.slug,title:String(term.data.title??term.slug),category:term.slug,scope:term.slug,
   items:(all:CatalogItem[])=>filterItems(all,{category:term.slug,colors:[],available:false})})),
  ...shop.collections.flatMap((entry):CatalogView[]=>typeof entry.data.code==='string'&&entry.data.code?[{handle:entry.data.code,title:String(entry.data.title??entry.data.code),description:entry.data.description,items:all=>all.filter(item=>item.collection===entry.data.code)}]:[])];
 // Preserve the existing public Braguitas URL while its category slug remains singular.
 const bottom=views.find(view=>view.category==='braguita');
 if(bottom)views.push({...bottom,handle:'braguitas'});
 return [...new Map(views.map(view=>[view.handle,view])).values()];
}
/** Query filters refine a page's fixed category scope; they cannot expand it. */
export function catalogCategories(view:CatalogView,terms:ShopEntry[]):ShopEntry[] {
 const ordered=categoryOptions(terms);
 if(!view.scope)return ordered;
 const root=terms.find(term=>term.slug===view.scope);
 if(!root)return [];
 const descendants=new Set([root.id]);
 return ordered.filter(term=>{
  if(typeof term.data.parent!=='string'||!descendants.has(term.data.parent))return false;
  descendants.add(term.id);return true;
 });
}
export const catalogView=(handle:string,shop:Pick<ShopContent,'collections'|'categories'>)=>catalogViews(shop).find(view=>view.handle===handle)??null;
export function facetOptions(items:CatalogItem[],shop:Pick<ShopContent,'colors'>) {
 const colors=new Set(items.map(item=>item.color));
 return {colors:shop.colors.flatMap(entry=>typeof entry.data.code==='string'&&colors.has(entry.data.code)?[{code:entry.data.code,label:String(entry.data.title??entry.data.code)}]:[])};
}
export function featuredItem(shop:Lookups,id:string|undefined):CatalogItem|null {
 return buildCatalog(shop).find(item=>item.kind==='bundle'&&item.id===id)??null;
}
