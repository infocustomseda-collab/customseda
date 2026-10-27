# Products Made From Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the product Color and Tallas fields with one Material per product, deriving the storefront color and the available sizes from that material.

**Architecture:** The catalog seed gains a single `material` reference on products and loses `color`/`sizes`. Business rules live in `src/lib/cms/catalog.ts` (pure) and `catalog-store.ts` (graph loading). A new versioned model migration links existing products to materials, renames the Braguita Curve drafts and drops the old fields. The public read layer (`src/lib/shop/content.ts`) loads materials and size categories, and `buildCatalog` derives each item's color and sizes from its material.

**Tech Stack:** Astro, EmDash 1.3.1 (`emdash`, `emdash/seed`), Kysely on SQLite/D1, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-27-product-materials-design.md`

## Global Constraints

- Use pnpm; validate with `pnpm test`, `pnpm test:d1`, `pnpm typecheck`, `pnpm build`.
- Error messages are Spanish, in the style of `src/lib/cms/catalog.ts`.
- Code style matches the surrounding files (compact one-space-indented TS in `src/lib/cms`, tab-indented TS in `src/lib/shop`).
- Data writes outside a migration go through `validateCatalogWrite` and EmDash handlers; raw SQL only inside a versioned model migration.
- Never copy local data to a remote database; no remote deploys (phase 7).
- The storefront shows the color name, never the material name; Edición especial has no storefront effect.
- Conjunto material equality is checked only when the conjunto itself is published or scheduled.
- Braguita renames get no redirects.

## Review Focus

- A conjunto whose component has no material at publication → publication refused with the material error, not a crash (Task 1 test `bundle publication requires every component to use its material`).
- A material with no tallas for the product's category → product listed, `sizes: []`, not purchasable; checkout returns `error: "size"` (Task 3 tests).
- A product whose staged draft and live row disagree on color → the migration uses the staged color (what the editor shows) (Task 2 test).
- Re-running the migration after an interrupted run → no duplicate renames or edges; fields already dropped are skipped (Task 2 test reruns `applyProductMaterials`).
- Changing the material of a component of a published conjunto → save allowed (Task 1 test `component material changes never block on their conjunto`).

---

### Task 1: Product material model and catalog rules

**Files:**
- Modify: `seed/seed.json` (products collection fields)
- Modify: `src/lib/cms/catalog.ts`
- Modify: `src/lib/cms/catalog-store.ts`
- Modify: `tests/helpers/catalog.mjs`
- Test: `tests/catalog.test.mjs`, `tests/catalog-store.test.mjs`, `tests/catalog-drafts.test.mjs`, `tests/materials.test.mjs`, `tests/catalog-model.test.mjs`

**Interfaces:**
- Produces: products field `material` (`type: reference`, `validation: {targetCollection: 'materials', multiple: false}`, `required: false`, label `Material`), placed where `color` was; fields `color` and `sizes` removed from the products seed.
- Produces: `validateCatalogEntry(entry, entries, {publish?, references?, componentMaterials?: boolean = true})`.
- Produces: `targets.products = {collection:'collections', material:'materials', size_guide:'size_guides', components:'products'}` in `catalog-store.ts`.
- Produces (test helper): `fixture(t)` returns `{..., materialId}` and `product(slug, category, material = materialId)`; the fixture material `rosa` (color `rosa`, published) has sizes `top-s`, `top-m`, `braguita-xs`, `braguita-xl`; `colorId` stays exported.

- [ ] **Step 1: Write the failing unit tests in `tests/catalog.test.mjs`**

Rebuild the fixture: drop the per-product `sizes`/`color` refs; add materials `m1` (published) and `m2` (published) to `entries`; `product(id, category, material='m1')` sets `refs.material=[material]`; the conjunto has `refs.material=['m1']`. Replace the two size-on-product tests. New/changed tests:

```js
test('publication requires one material on every product',()=>{
 for(const refs of [{...top.refs,material:[]},{...top.refs,material:['m1','m2']},{...top.refs,material:['pink']}]) assert.ok(check({...top,refs},true).length);
 assert.deepEqual(check({...top,refs:{...top.refs,material:[]}}),[]);
 const set=conjunto();set.refs.material=[];assert.ok(check(set,true).length);
});
test('bundle publication requires every component to use its material',()=>{
 const changed=new Map(entries);changed.set('b',{...bottom,refs:{...bottom.refs,material:['m2']}});
 assert.ok(validateCatalogEntry(conjunto(),changed,{publish:true}).some(e=>e.includes('material')));
 changed.set('b',{...bottom,refs:{...bottom.refs,material:[]}});
 assert.ok(validateCatalogEntry(conjunto(),changed,{publish:true}).some(e=>e.includes('material')));
 assert.deepEqual(validateCatalogEntry(conjunto(),changed),[]);
 assert.deepEqual(validateCatalogEntry(conjunto(),changed,{publish:true,componentMaterials:false}).filter(e=>e.includes('material')),[]);
});
```

Rename `bundles require distinct ordinary components and do not compare colors or collections` to `... and do not compare collections` and drop its color assertion.

- [ ] **Step 2: Run** `node --test tests/catalog.test.mjs` — Expected: FAIL (no material rule).

- [ ] **Step 3: Implement the model and rules**

- `seed/seed.json`: products fields as in Interfaces.
- `catalog.ts`, products with `references`: replace `ref('color')`/`ref('sizes')` and the size-category loop with: `if(publish || refs.material?.length) ref('material','materials')` for every product. In the bundle branch, when `publish && componentMaterials`, for each component whose `refs.material?.[0]` differs from `refs.material?.[0]` (or is missing) fail `Las piezas del conjunto deben usar el material del conjunto («${component.data.title}»).`. Keep `ref('collection','collections')` for pieces.
- `catalog-store.ts`: new `targets.products`; update the five-term UNION comment (now four terms); in the dependent-bundle loop pass `componentMaterials:false` to `validateCatalogEntry`.

- [ ] **Step 4: Run** `node --test tests/catalog.test.mjs` — Expected: PASS.

- [ ] **Step 5: Update the runtime fixture and runtime tests**

- `tests/helpers/catalog.mjs`: after creating color `rosa`, create and publish material `rosa` with the four sizes in Interfaces via `handleContentCreate(db,'materials',…)`/`handleContentPublish`; `product()` sends `references:{collection:[margarita], material:[material]}`; the bundle gets `material:[materialId]` too.
- `tests/catalog-store.test.mjs`: line 19 → `references:{material:[f.colorId]}` must be rejected (wrong target); line 103 → material instead of color/sizes; rename `sizes keep their category while used; products only publish sizes of their own category` to `sizes keep their category while used by a material` and remove its product-size assertions (lines 176–178); keep the size label/category assertions (`top-xl` is unused by the fixture material).
- Add to `tests/catalog-store.test.mjs`:

```js
test('component material changes never block on their conjunto',async t=>{
 const f=await fixture(t);
 const other=await f.runtime.handleContentCreate('materials',{slug:'otro',data:{title:'Otro'},references:{color:[f.colorId]}});
 assert.equal((await f.runtime.handleContentPublish('materials',other.data.item.id)).success,true);
 assert.equal((await f.runtime.handleContentPublish('products',f.bundle)).success,true);
 assert.deepEqual(await validateCatalogWrite(f.db,'products',f.top,{references:{material:[other.data.item.id]}},{publish:true}),[]);
 assert.equal((await f.runtime.handleContentUpdate('products',f.top,{references:{material:[other.data.item.id]}})).success,true);
 assert.equal(await removalAllowed(f.db,'materials',f.materialId),false);
});
```

- `tests/catalog-drafts.test.mjs`: the incomplete draft omits `material` and cannot publish (rename to `... cannot be published without a material`); the Spanish draft test asserts `references.material.children` ids `[f.materialId]`.
- `tests/catalog-model.test.mjs`: products fields contain `material` and not `color`/`sizes`.

- [ ] **Step 6: Run** `pnpm test` — Expected: all CMS tests PASS (shop tests may still fail until Task 3; list any failures outside `tests/shop-*`, `tests/commerce-*`, `tests/native-catalog.test.mjs` as blockers).

- [ ] **Step 7: Commit** — `git commit -m "Give products one material and check conjunto materials at publication"`

---

### Task 2: Migration from product colors and sizes to materials

**Files:**
- Create: `src/lib/cms/product-materials.ts`
- Modify: `src/lib/cms/model-migration.ts` (register after `materialsVersion`)
- Test: `tests/product-materials.test.mjs`; version lists in `tests/storefront-model.test.mjs`, `tests/integration/catalog-d1.test.mjs`

**Interfaces:**
- Consumes: `dropField(db, collection, field)` from `src/lib/cms/drop-field.ts`; `validateCatalogWrite`; seed products collection from Task 1.
- Produces: `productMaterialsVersion = 'customseda.product-materials.v1'`; `applyProductMaterials(db: CatalogDb): Promise<{version, applied, linked?: number, renamed?: number, unlinked?: string[]}>` (`unlinked` = product slugs left without a material).
- Produces: exported constant `braguitaRenames: Record<string,{slug:string;title:string}>` with exactly the spec's table (`braguita-curve` → `braguita-curve-tierra` / `BRAGUITA CURVE TIERRA`, `braguita-curve-2` → `…-fuego`, `braguita-luz` → `…-luz`, `braguita-curve-3` → `…-marea`, `braguita-curve-1` → `…-destello`, `braguita-flow` → `braguita-flow-tierra` / `BRAGUITA FLOW TIERRA`).

- [ ] **Step 1: Write the failing test `tests/product-materials.test.mjs`**

Build a legacy database like `tests/size-categories.test.mjs` does: clone the seed, put back products `color` (reference → colors, single) and `sizes` (reference → sizes, multiple) and remove `material`, apply it with `runMigrations` + `applySeed` (as the size test does), create and publish colors `caoba` and `rojo` with `handleContentCreate`/`handleContentPublish`, then call `applyMaterials(db)` so materials `caoba` and `rojo` exist. Create products: `braguita-curve` (category braguita, color caoba), `top-tierra` (top, caoba), conjunto `tierra` (components both), `braguita-curve-2` (braguita, rojo) with a pending draft revision whose `_references.color` is `[caoba group]` and whose data title is `BRAGUITA CURVE`, and `sin-color` (no color). Assertions:

```js
const result=await applyProductMaterials(db);
assert.equal(result.applied,true);assert.deepEqual(result.unlinked,['sin-color']);
assert.deepEqual(await materialOf('braguita-curve-tierra'),'caoba');   // renamed and linked
assert.equal((await repo.findByIdOrSlug('products','braguita-curve-tierra')).data.title,'BRAGUITA CURVE TIERRA');
assert.equal(await materialOf('tierra'),'caoba');                       // conjunto takes the shared material
assert.equal(await materialOf('braguita-curve-fuego'),'caoba');         // staged color wins
assert.equal(draftTitle('braguita-curve-fuego'),'BRAGUITA CURVE FUEGO'); // revision title renamed
for(const field of ['color','sizes']) assert.equal(await new SchemaRegistry(db).getField('products',field),null);
assert.equal(relationsNamed(['products_color','products_sizes']).length,0);
assert.equal(stagedKeys(['color','sizes']).length,0);                   // _references and _referencesBaseline scrubbed
assert.equal((await applyProductMaterials(db)).applied,false);
```

(`materialOf(slug)` reads `readCatalogEntry(db,'products',id,true).refs.material` → material slug; small local helpers.) Also a second test: a fresh database (`applyModelMigrations`) reports `applied:true, linked:0, renamed:0, unlinked:[]`.

- [ ] **Step 2: Run** `node --test tests/product-materials.test.mjs` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `applyProductMaterials` in `src/lib/cms/product-materials.ts`**

Order, each step idempotent:
1. Option-marker check (same pattern as `materials.ts`).
2. `applySeed(db,{version:'1',collections:[products]},{includeContent:false,onConflict:'update'})` to add `material`.
3. If the products `color` field still exists: map color group → material group from `materials_color` edges; for each non-deleted product take the staged `_references.color` from its draft revision if present, else its live `products_color` edge. Pieces get that color's material; conjuntos get their components' material when all are equal and set. Validate every planned write with `validateCatalogWrite(db,'products',id,{references:{material:[m]}})` before writing anything; throw on errors. Write with `handleContentUpdate(db,'products',id,{references:{material:[m]}})`. Collect slugs left without a material.
4. Renames: for each `braguitaRenames` key that exists, `ContentRepository.update(..., {slug, data:{title}})` and, if the row has a draft revision, `json_set` its `$.title` (and `$._slug` when present) inside the migration.
5. `dropField(db,'products','color')`, `dropField(db,'products','sizes')`; remove `$._references.color`, `$._references.sizes`, `$._referencesBaseline.color`, `$._referencesBaseline.sizes` from product revisions.
6. Set the marker; return counts.

Register in `model-migration.ts` (`modelVersions` and `applyModelMigrations`, after `applyMaterials`) and add `[productMaterialsVersion,true]` / an extra `false` to the version-list tests.

- [ ] **Step 4: Run** `node --test tests/product-materials.test.mjs tests/storefront-model.test.mjs` and `pnpm test:d1` — Expected: PASS. Confirm that `deleteField` removed the `products_color`/`products_sizes` relations and edges; if EmDash 1.3.1 leaves them, delete them in step 5 and keep the assertion.

- [ ] **Step 5: Commit** — `git commit -m "Migrate products from colors and sizes to materials"`

---

### Task 3: Storefront and checkout derive color and sizes from the material

**Files:**
- Modify: `src/lib/shop/content.ts` (`shopTypes`, size category assignments)
- Modify: `src/lib/shop/catalog.ts` (`buildCatalog`, `Lookups`)
- Modify: `src/lib/commerce/checkout.ts` (`QuoteShop` adds `"materials"`)
- Modify: `src/lib/publish/rebuild.ts` (`REBUILD_COLLECTIONS` adds `"materials"`)
- Test: `tests/shop-catalog.test.mjs`, `tests/shop-detail.test.mjs`, `tests/commerce-checkout.test.mjs`, `tests/shop-paths.test.mjs`, `tests/native-catalog.test.mjs`, `tests/shop-content.test.mjs`, `tests/publish-rebuild.test.mjs` (if it lists collections)

**Interfaces:**
- Consumes: product `refs.material`, material `refs.color`/`refs.sizes` (Task 1 model).
- Produces: `shopTypes.products = {collection, material:"materials", size_guide, components}`, `shopTypes.materials = {color:"colors", sizes:"sizes"}`; every `shop.sizes` entry carries `refs.category` (same normalization as products).
- Produces: `CatalogItem.color` = material's color slug; `CatalogItem.sizes` = labels of the material's sizes whose `refs.category[0]` equals the item's category id, ordered by `orderSizes`; conjunto `color` = its own material's color, `sizes` = union of components' sizes (unchanged rule).

- [ ] **Step 1: Write the failing tests**

In each storefront fixture replace product `color`/`sizes` refs with `material`, add `materials` entries (`refs:{color:[...], sizes:[...]}`), and give size entries `refs.category`. In `tests/shop-catalog.test.mjs` the materials are `m-caoba` (color caoba; sizes Top S, Top M, Braguita XS) used by `top-tierra`, `braguita-curve` and the conjunto `tierra`, and `m-top-only` (color caoba; Top sizes only) used by `braguita-flow`; import `productDetail` from `src/lib/shop/detail.ts`. Keep the existing tests' expectations where the fixture change does not alter them. New assertions:

```js
test('sizes come from the material, limited to the product category',()=>{
 // material m-caoba offers Top S, M and Braguita XS; top-tierra (top) → S,M; braguita-curve (braguita) → XS
 const items=buildCatalog(shop);const by=slug=>items.find(i=>i.slug===slug);
 assert.deepEqual(by('top-tierra').sizes,['S','M']);
 assert.deepEqual(by('braguita-curve').sizes,['XS']);
 assert.equal(by('top-tierra').color,'caoba');
 assert.equal(by('tierra').color,'caoba');
});
test('a material without sizes for the category leaves the piece unbuyable',()=>{
 // braguita-flow uses m-top-only, whose sizes are all Top sizes
 assert.deepEqual(buildCatalog(shop).find(i=>i.slug==='braguita-flow').sizes,[]);
 assert.equal(productDetail(shop,'braguita-flow').purchasable,false);
});
```

`tests/commerce-checkout.test.mjs`: a size offered by the material for another category (e.g. `XS` on a top whose material has `XS · Braguita`) returns `error:"size"`. `tests/shop-content.test.mjs`: the fixture top's `refs.material` is `[f.materialId]` and the material's `refs.sizes` contains `f.lookups['top-s']`; sizes carry `refs.category`.

- [ ] **Step 2: Run** `pnpm test` — Expected: the new storefront tests FAIL.

- [ ] **Step 3: Implement**

- `content.ts`: new `shopTypes`; generalize the category assignment loop to `products` and `sizes`.
- `catalog.ts`: `Lookups` adds `"materials"`; `piece(entry)` resolves `material = shop.materials.find(id === entry.refs.material?.[0])`, `color` = slug of `shop.colors` entry `material.refs.color[0]`, `sizes` = `orderSizes(material.refs.sizes → shop.sizes entries with refs.category?.[0] === entry.refs.category?.[0] → data.label)`. Use `own.color` for conjuntos (from their own material); drop the shared-component color derivation.
- `checkout.ts`, `rebuild.ts`: as in Files.

- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` — Expected: PASS, 0 errors.

- [ ] **Step 5: Commit** — `git commit -m "Derive storefront color and sizes from product materials"`

---

### Task 4: Documentation, local migration and verification

**Files:**
- Modify: `AGENTS.md` (Scope line: conjuntos "do not validate matching component colors" → "components must use the conjunto's material, checked at conjunto publication")
- Modify: `docs/catalog-model.md` (Productos, Bundle products, Materiales rows; migration paragraph for `customseda.product-materials.v1` with the rename table and "no redirects")
- Modify: `emdash-env.d.ts` (regenerated by `pnpm cms:model`)

- [ ] **Step 1: Back up local D1** — `sqlite3 <local d1 sqlite> ".backup 'backups/pre-product-materials-2026-10-27.sqlite'"` (same file used for previous backups).
- [ ] **Step 2: Apply** — with `pnpm dev` running, `pnpm cms:model`. Expected: `customseda.product-materials.v1: applied. Local D1 only.`
- [ ] **Step 3: Verify data** — every product has a material equal to its former color; conjuntos tierra/fuego/luz/marea/destello have their pieces' material; the six braguitas carry the new slugs and titles (row and draft revision); `ec_products` has no `color`/`sizes` columns; report any `unlinked` slugs to the user.
- [ ] **Step 4: Verify storefront** — `curl` `/collections/bikinis` (color filter values unchanged: caoba, dorado, rojo, rojo-brillante, turquesa), `/products/braguita-curve-fuego` (sizes XS–XL), `/products/top-destello` (sizes S–XL, since materials keep all nine tallas), `/products/fuego` (two pickers). Run `pnpm build`; expect success.
- [ ] **Step 5: Update docs**, run `pnpm test`, `pnpm test:d1`, `pnpm typecheck`.
- [ ] **Step 6: Commit** — `git commit -m "Document product materials and apply them locally"`
