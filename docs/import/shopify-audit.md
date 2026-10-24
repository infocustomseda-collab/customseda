# Shopify public-content audit — 2026-10-25

## Scope and evidence

This is the first local phase 3 deliverable. The source is the public storefront at <https://www.customseda.com/>. It is not a Shopify Admin export and cannot establish completeness for drafts, archived products, private metafields, or market-specific records. No Shopify or EmDash content was changed. No staging operation was performed.

The [structured inventory](shopify-public-inventory.json) preserves public Shopify product/variant/image IDs as strings, descriptions, ordered galleries, variant prices in integer EUR cents, observed availability, visible color labels, page SEO metadata, internal links, collection membership, sitemap URLs, and proposed bundle links. Each proposal is explicitly unconfirmed.

Raw responses are retained locally in ignored `backups/shopify-public-2026-10-25/`; their SHA-256 checksums are in the inventory. These are public-source captures, not a CMS/database recovery backup. Gallery files have not yet been downloaded or uploaded to local R2; the manifest records their source URLs and original dimensions.

Read `/products.json?limit=250&page=1` and page 2 (empty). All 16 public products also appear in the product sitemap, which additionally includes the homepage. Read the six public collection membership endpoints, all product HTML pages, all five sitemap-listed pages, the blog route, and the public privacy policy. Category membership confirms 5 Conjuntos, 5 Tops, and 6 Braguitas. No private Shopify connector, CSV, or API credentials are available in the repository; a source-data question is pending in chat.

## Public product inventory

All prices below are observed EUR prices. All variants of each entry have the same price. `available` is an observation from Shopify's public JSON, not an approved mapping to the new made-to-order editorial availability switch.

| Handle | Type | Visible color | Price | Observed sizes | Images |
| --- | --- | --- | ---: | --- | ---: |
| `tierra` | Conjunto | Caoba | 50.00 | Top S/M/L/XL; Braguita XS/S/M/L/XL | 7 |
| `destello` | Conjunto | Rojo Brillante | 55.00 | Top M; Braguita S/M | 6 |
| `luz` | Conjunto | Dorado | 60.00 | Top S/M/L; Braguita S/M/L | 6 |
| `fuego` | Conjunto | Rojo | 55.00 | Top S/M/L/XL; Braguita XS/S/M/L/XL | 5 |
| `marea` | Conjunto | Turquesa | 50.00 | Top S/M/L/XL; Braguita S/M/L/XL | 4 |
| `top-tierra` | Top | Caoba | 30.00 | S/M/L | 4 |
| `top-destello` | Top | Rojo Brillante | 32.00 | M | 5 |
| `top-luz` | Top | Dorado | 35.00 | S/M/L | 4 |
| `top-fuego` | Top | Rojo | 32.00 | S/M/L | 5 |
| `top-marea` | Top | Turquesa | 30.00 | S/M/L/XL | 3 |
| `braguita-curve` | Braguita | Caoba | 26.00 | Unknown: only `Default Title` | 4 |
| `braguita-flow` | Braguita | Caoba | 26.00 | Unknown: only `Default Title` | 5 |
| `braguita-curve-1` | Braguita | Rojo Brillante | 28.00 | M/S (source order) | 6 |
| `braguita-curve-2` | Braguita | Rojo Mate | 28.00 | XS/S/M/L/XL | 6 |
| `braguita-curve-3` | Braguita | Turquesa | 26.00 | XS/S/M/L/XL | 6 |
| `braguita-luz` | Braguita | Dorado | 30.00 | S/M/L | 5 |

Totals: **16 entries, 98 variants, 81 gallery positions, 74 distinct Shopify gallery image IDs/URLs**. All 81 source gallery alt values are missing. Shared image IDs occur across entries: preserve gallery order per entry while deduplicating media by source identity. The image count excludes supporting page and collection assets, which are recorded separately.

## Proposed component mapping and unresolved decisions

These are inferences from public names, color labels, cuts, and imagery, not exported bundle relationships. Confirm them before importing relationships.

| Conjunto | Proposed Top | Proposed Braguita | Issue |
| --- | --- | --- | --- |
| Tierra | `top-tierra` | `braguita-curve` | Set includes Top XL; single Top omits XL. Bottom has no size data. |
| Destello | `top-destello` | `braguita-curve-1` | Sizes align; set is unavailable while its proposed pieces are available. |
| Luz | `top-luz` | `braguita-luz` | Sizes and visible colors align. |
| Fuego | `top-fuego` | `braguita-curve-2` | Set includes Top XL; single Top omits XL. `Rojo` and `Rojo Mate` need a canonical color decision. |
| Marea | `top-marea` | `braguita-curve-3` | Bottom includes XS individually but set omits XS. |

**Merchant decision — 2026-10-25:** The user confirmed that the listed Shopify sizes are correct. Preserve those explicit options, including Destello M-only and the differences between set and individual-piece options; do not interpret them as stock restrictions or silently expand/reduce them.

Curve Caoba and Flow Caoba still expose only `Default Title`, which is not a supported size in the target model. Their actual supported sizes require an explicit answer. The confirmed set/component differences also require a model decision before importing bundle relationships: the current target derives set size choices from the linked individual pieces and cannot express Top XL available only in a set or exclude bottom XS only in a set. Do not alter confirmed sizes to work around that limitation.

All Destello set variants report unavailable; the other 96 variants report available. Because the replacement is made to order, confirm whether Destello should remain unavailable. Raw HTML contains hidden sold-out labels even on purchasable products; do not parse those labels as availability.

Five separate entries have the title `BRAGUITA CURVE`; retain stable Shopify IDs/handles rather than deduplicating by title. Flow is a distinct sixth bottom, with medium coverage; do not drop it because it has no proposed set.

Destello's set description says 90% polyamide / 10% elastane, while both proposed components say 85% polyester / 15% elastane. Preserve the discrepancy for editorial resolution. Do not silently rewrite source composition claims. Fuego's Rojo/Rojo Mate labels must be resolved before enforcing same-color bundle references. Do not invent hexadecimal swatches.

## Collections, pages, navigation, and URLs

Six collection records are exposed: `bikinis` (Conjuntos), `top`, `braguitas`, `gran-canaria` (Canarias), `peninsula` (Europa), and `frontpage`. Their public membership endpoints return 5, 5, 6, 1, 0, and 0 entries respectively. Metadata reports 2 for Canarias and 69 for Europa; these counts do not prove that additional products are currently publicly accessible. An authenticated export is needed to explain the discrepancy.

Margarita is a story page and is named in product page introductions; it is not one of the six exposed Shopify collection records. Keep the agreed target collection Margarita and do not convert shipping-region or storefront category groupings into target merchandising collections automatically.

| Source route | Observed role | Proposed treatment |
| --- | --- | --- |
| `/` | Homepage, Margarita hero, featured Tierra, creation/process copy | Site settings and reusable homepage sections |
| `/products/<handle>` (16 routes) | Individual item or Conjunto detail | Prefer retaining each handle and route; target routing is phase 4 |
| `/collections/bikinis` | Five sets | Preserve access to the set grouping within the combined catalog |
| `/collections/top`, `/collections/braguitas` | Category lists | Category views |
| `/collections/gran-canaria`, `/collections/peninsula`, `/collections/frontpage` | Region/legacy groupings | Record URLs; decide content or redirects before launch |
| `/pages/contact` | Contact form | Contact page; form delivery is separate frontend/backend work |
| `/pages/conjuntos` | Short legacy “PULSO” collection copy | Editorial decision: conflicts with current Margarita story |
| `/pages/guia-de-tallas` | Image-based size guide | Local media plus accessible structured size guide |
| `/pages/margarita` | Current collection story | Collection content/story page |
| `/pages/envios-y-devoluciones` | Shipping, pickup, returns, customs copy | Preserve source; merchant review during checkout phase |
| `/blogs/noticias` | “HOLA! SOY PAULA SEDA” About content | About page or preserved route; no journal required |
| `/policies/privacy-policy` | Shopify-specific privacy copy | Rewrite for actual replacement services before launch |

`/policies/refund-policy`, `/policies/shipping-policy`, `/policies/terms-of-service`, and `/policies/contact-information` returned 404. Shipping and returns copy is instead on the combined page above. The URL inventory also records `/collections/bikinis/Todo` from homepage navigation; its intended filtered-list behavior requires frontend routing review. URL treatments are proposals, not implemented redirects.

Home navigation links to Conjuntos, Margarita, About at `/blogs/noticias`, and Contact; footer links include shipping/returns, privacy, Instagram, and TikTok. Header/footer link URLs are captured per page; Shopify admin/theme menu IDs and exact menu definitions are not available from public HTML. Customer authentication/cart links are platform behavior, not evidence that customer accounts belong in the target scope.

The size-guide page has no text table; its main asset is `guia_de_tallas.png` (original source URL is in the inventory). Preserve and inspect that image before transcribing measurements. Page titles, canonical URLs, meta descriptions, and Open Graph values are recorded. Some pages lack a specific meta description or use the site's general fallback. Visible product introductions include color and model-size copy absent from the product JSON; those introductions are captured separately.

## Inputs required before catalog writes

1. Source completeness: Shopify CSV/API export if available, otherwise explicitly use the public catalog with its documented limitations.
2. Supply supported sizes for Curve Caoba and Flow Caoba, which have no explicit source size options. Explicit Shopify sizes are confirmed correct; agree how the target model will preserve the confirmed set/component differences before importing relationships.
3. Confirm the proposed five component mappings, normalize Rojo/Rojo Mate, and choose the made-to-order availability of Destello.
4. Resolve contradictory composition/legacy collection copy and prepare descriptive image alt text before publishing.

The importer must remain local-only in this phase, support dry runs and retry without duplicate content/media, call `validateCatalogWrite`, create lookups and pieces before Conjuntos, and report unresolved records instead of supplying invented values. Source IDs, ordered media references, and explicit mapping decisions provide its inputs. Confirm the local CMS locale before writing Spanish content. Staging rehearsal and full remote acceptance remain phase 7.
