// Local content maintenance: transcribe the imported chart into native, editable Portable Text.
// Reads the size guide and its public page; saves only content, preserving publication status.
// No schema changes. Both the product disclosure and public guide read their existing content field.
// Source: assets/originals/site/01M5R1TYYYQABQEQTA2HPCS65G.png--guia_de_tallas.png.
// Run with pnpm dev active: node scripts/cms/size-guide-text.mjs. Re-running is a no-op.
const origin = 'http://127.0.0.1:4321';
const marker = 'chart-text-intro';
const block = (key, text, style = 'normal', listItem) => ({
 _type: 'block', _key: key, style, markDefs: [],
 ...(listItem ? {listItem, level: 1} : {}),
 children: [{_type: 'span', _key: `${key}-span`, text, marks: []}],
});
const transcription = [
 block(marker, 'Las medidas indicadas corresponden al patrón extendido y estirado sobre una superficie plana.'),
 block('chart-top', 'Top', 'h3'),
 block('chart-top-labels', 'A: altura del frontal. B: ancho de la base. C: cinta de ajuste. Medidas en centímetros; consulta las flechas del esquema.'),
 ...[['S',14],['M',16],['L',18],['XL',20]].map(([size,a]) =>
  block(`chart-top-${size}`, `${size}: A ${a} cm · B 62 cm`, 'normal', 'bullet')),
 block('chart-top-strap', 'La cinta de ajuste tiene una longitud aproximada de entre 80 y 100 cm, lo que permite regularla fácilmente para conseguir una sujeción cómoda y adaptada a ti.'),
 block('chart-bottom', 'Braguita Curve y Braguita Flow', 'h3'),
 block('chart-bottom-labels', 'Las letras corresponden a las flechas del esquema: A y B en la parte delantera, C en la parte trasera de la Braguita Curve y D en la parte trasera de la Braguita Flow. Medidas en centímetros.'),
 ...[['XS',26,24,6,8],['S',28,26,7,9],['M',31,28,8,10],['L',34,31,9,11],['XL',36,32,10,12]].map(([size,a,b,c,d]) =>
  block(`chart-bottom-${size}`, `${size}: A ${a} cm · B ${b} cm · C ${c} cm · D ${d} cm`, 'normal', 'bullet')),
 block('chart-variation', 'Al estar confeccionados a mano, las medidas pueden variar ligeramente de una pieza a otra.'),
];

const auth = await fetch(`${origin}/_emdash/api/auth/dev-bypass`, {redirect:'manual'});
if (!auth.ok) throw new Error('Start pnpm dev before updating the local size guide.');
const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
async function api(path, init = {}) {
 const response = await fetch(`${origin}/_emdash/api/content/${path}`, {
  ...init, headers: {Cookie: cookie, Origin: origin, 'X-EmDash-Request':'1', 'Content-Type':'application/json'},
 });
 if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
 const body = await response.json();
 return body.data ?? body;
}
for (const collection of ['size_guides', 'pages']) {
 const {item} = await api(`${collection}/guia-de-tallas`);
 const content = item.data.content;
 if (!Array.isArray(content)) throw new Error(`Unexpected content in ${collection}.`);
 const image = content.find(part => part._type === 'image' && part.asset?.filename === 'guia_de_tallas.png');
 if (!image) throw new Error(`Expected source chart missing in ${collection}; no write performed.`);
 // The surrounding page/disclosure already supplies this title.
 const body = content.filter((part, index) => !(index === 0 && part._type === 'block'
  && part.style === 'normal' && part.children?.map(span => span.text ?? '').join('').trim() === item.data.title));
 const updated = body.some(part => part._key === marker) ? body
  : body.flatMap(part => part === image ? [...transcription, part] : [part]);
 if (JSON.stringify(updated) === JSON.stringify(content)) {
  console.log(`${collection}: transcription already present.`);
  continue;
 }
 await api(`${collection}/${item.id}`, {method:'PUT', body: JSON.stringify({data:{content:updated}})});
 console.log(`${collection}: saved editable chart transcription; status unchanged.`);
}
