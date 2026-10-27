// Storefront fixtures written as products with a color and sizes, converted to the material model:
// each piece gets its own material with that color and those sizes (in the piece's category), and a
// conjunto uses its pieces' material when they share a color.
const LABELS=['XS','S','M','L','XL'];
export function withMaterials(shop) {
 const labelOf=new Map(shop.sizes.map(size=>[size.id,size.data.label]));
 const pieces=shop.products.filter(product=>product.data.bundle!==true);
 const categories=[...new Set(pieces.map(product=>product.refs.category?.[0]).filter(Boolean))];
 const sizes=categories.flatMap(cat=>LABELS.map((label,i)=>({id:`s-${cat}-${label}`,slug:`s-${cat}-${label}`,status:'published',data:{title:`${label} · ${cat}`,label,sort_order:i},refs:{category:[cat]}})));
 const materials=[],materialOf=new Map();
 const converted=shop.products.map(product=>{
  if(product.data.bundle===true) return product;
  const {color=[],sizes:own=[],...refs}=product.refs;
  const id=`m-${product.id}`;
  materials.push({id,slug:id,status:'published',data:{title:id},refs:{color,sizes:own.map(size=>`s-${refs.category?.[0]}-${labelOf.get(size)}`)}});
  materialOf.set(product.id,id);
  return {...product,refs:{...refs,material:[id]}};
 });
 const products=converted.map(product=>{
  if(product.data.bundle!==true) return product;
  const parts=(product.refs.components??[]).map(id=>shop.products.find(piece=>piece.id===id)).filter(Boolean);
  const shared=parts.length && new Set(parts.map(part=>part.refs.color?.[0])).size===1;
  return shared ? {...product,refs:{...product.refs,material:[materialOf.get(parts[0].id)]}} : product;
 });
 return {...shop,sizes,materials,products};
}
