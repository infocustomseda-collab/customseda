# Products made from materials

Date: 2026-10-27. Status: approved in conversation; pending plan.

## Intent

What the shop can make depends on how much of each fabric is left. A remnant may be enough for one S braguita or one M top. Size availability therefore belongs to the fabric (the **Material**), not to each product. Editors adjust a material's Disponibilidad once, and every product made from it follows.

Today a product carries its own Color and Tallas. After this change a product carries one Material, and both its color and its available sizes come from that material.

## Current state

- Materiales exist (`customseda.materials.v1`): Nombre, one Color, Disponibilidad (multi-reference to Tallas), Edición especial. Five published materials, one per color, each with all nine tallas. Not linked to products.
- Tallas belong to one native category; titles read `S · Top`; the shopper-facing size is Etiqueta.
- Products: one native category; individual products have Colección, Color and Tallas; bundles (conjuntos) have ordered components, and component colors are deliberately not validated (`AGENTS.md`, `docs/catalog-model.md`).
- Local catalog: 11 individual products and 5 conjuntos, all drafts. Each conjunto's two pieces share a color. One product per fabric variant.

## Goals

1. Products lose their Color and Tallas fields (admin, schema, database, revision copies).
2. Every product, individual or conjunto, has exactly one Material, required to publish.
3. A conjunto's components must all use the conjunto's own material.
4. Catalog color filter: product → material → color. A conjunto's color is its material's color.
5. Product page sizes: product → material → Disponibilidad, keeping only tallas whose category equals the product's category. For a conjunto, each component offers its own material's tallas for that component's category (the same material, so the conjunto's).
6. Checkout accepts only a size the material currently offers for that product's (component's) category, as it does today with product sizes.
7. Data: each existing product is linked to the material of its current color; the old Color and Tallas selections are then removed. Materials keep all nine tallas; the merchant trims them later.
8. Data correction: the Braguita Curve products are renamed after their conjunto line, like the tops.

## Non-goals

- No change to Colección, Guía de tallas, price, category, gallery or availability switch.
- The shop never shows the material name; it shows the color name, as now.
- Edición especial has no storefront effect yet.
- No stock or quantity tracking (made to order).
- No multi-material products or shopper material choice: one product per fabric variant.

## Anti-goals

- A product silently offering a size of another category (an `S · Top` on a braguita).
- A conjunto whose pieces are in a different fabric from the conjunto.
- Losing product IDs, drafts, prices, galleries, categories or conjunto links in the migration.
- Writing catalog SQL outside a versioned migration; data changes go through `validateCatalogWrite` and EmDash handlers, as in `materials.ts`.

## Rules

| Rule | Detail |
| --- | --- |
| Material on products | Exactly one, every product type, required at publication. Drafts may omit it. |
| Conjunto components | Each component's material must equal the conjunto's material. Replaces the "do not validate matching component colors" rule in `AGENTS.md` and `docs/catalog-model.md`; update both. **Checked only when the conjunto is published or scheduled** (decided: option a). Saving a conjunto or a component, including changing a component's material while its conjunto is published, is never blocked by this rule, so a line can move to another fabric; a mismatched published conjunto stays live until it is fixed and republished. Missing materials are never a mismatch at save time. |
| No sizes for the category | Publishing is allowed; the product shows as not buyable (existing "size-less" behavior). A conjunto is buyable only when every component has at least one size, as now. |
| Protection | A material used by any product (live or staged) cannot be deleted or unpublished, like other references. Changing a material's color or Disponibilidad is allowed and takes effect on the next snapshot. The existing dependent-conjunto checks on component edits (nested bundles, deletion, unpublication) stay; material equality is not part of them. |
| Category filter of sizes | Exact match between the talla's category and the product's (component's) category, the same comparison used by the current product size rule. |

## Data migration (new versioned model migration)

1. Add the product `material` reference (single, target `materials`) via the seed upsert.
2. For each product, live and pending draft:
   - individual product: material = the material whose color is the product's current color;
   - conjunto: material = its components' shared material (all local conjuntos share one).
   Products with no color, or no matching material, are left without a material and reported; publication then requires one.
3. Rename the Braguita Curve products (title and slug) after the conjunto line of their color:

   | Current slug | Color | New title | New slug |
   | --- | --- | --- | --- |
   | braguita-curve | Caoba | BRAGUITA CURVE TIERRA | braguita-curve-tierra |
   | braguita-curve-2 | Rojo | BRAGUITA CURVE FUEGO | braguita-curve-fuego |
   | braguita-luz | Dorado | BRAGUITA CURVE LUZ | braguita-curve-luz |
   | braguita-curve-3 | Turquesa | BRAGUITA CURVE MAREA | braguita-curve-marea |
   | braguita-curve-1 | Rojo Brillante | BRAGUITA CURVE DESTELLO | braguita-curve-destello |
   | braguita-flow | Caoba | BRAGUITA FLOW TIERRA | braguita-flow-tierra |

   This is local editorial data, not a general rule: apply it by current slug and skip slugs that do not exist (fresh or remote databases). All are unpublished drafts. The owner approved the renames without redirects from the old Shopify slugs; record no redirect map.
4. Drop the product `color` and `sizes` fields with `dropField` (also scrubs revision copies), and their relations' staged `_references` keys in pending revisions.
5. Materials keep all nine tallas.

Back up local D1 before applying; never copy local data to remote.

## Storefront and checkout

- Snapshot/content loader reads Materiales (with their color and sizes references) and the size categories it needs for the filter; add `materials` to the rebuild-triggering collections.
- Catalog item color: material's color slug (conjunto: its own material). Card metadata, related products and the homepage featured conjunto use that color, as they use the product color now.
- Catalog item sizes: material sizes whose category equals the item's category, labels ordered XS–XL. Conjunto: per component, from the component's material and category.
- Size picker, product page, checkout quote and Stripe metadata keep using the Etiqueta labels they use today.

## Decided in conversation

- Availability is about fabric; one material per product; Braguita Curve naming follows the conjunto line of its color.
- Conjuntos have a material and accept only components with that same material.
- Materials start with all nine tallas.
- Color comes from the material; sizes from the material filtered by product category.
- Conjunto material equality is checked at conjunto publication only.
- Braguita renames need no redirects.

## Calls made by the designer (check these)

- Migration order: link materials, rename, then drop the old fields; products without a color or matching material stay without one and are reported.
- A conjunto's material in the migration is its components' shared material.
- Products whose material lacks tallas for their category remain publishable but not buyable.
- Pending draft revisions are migrated as well as live rows.

## Left to the builder

- Field label for the product reference (suggest "Material").
- Error copy (Spanish, matching existing messages).
- Whether the conjunto/component material check lives in the product validator or in the dependent-bundle check, as long as both directions are enforced.
- Snapshot shape for material data and query organization within D1 limits.
- Test organization; update existing fixtures from product colors/sizes to materials.
