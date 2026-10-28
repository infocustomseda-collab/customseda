# Product detail refinement

The user approved all recommendations from the MAREA critique on 2026-10-28 (“proceed with all”). This is a local refinement of phase 4's product template, preserving the brand and merchant description.

## Approved direction

Show product identity/price and description before purchase choices. Replace the separate Incluye thumbnails with quiet linked text. Compact sizing labels, typography and spacing while preserving usable radio targets. Move the native size-guide disclosure beside sizing, with readable text measurements alongside the original artwork. Keep existing production information when configured; add no unconfirmed lead times.

The quiet included-piece line was recommended over integrating links into the size selectors: it explains the set before the purchase form and keeps navigation separate from selection.

## Implementation and content

The shared product route and BuyBox provide this layout for individual pieces and Conjuntos. The guide remains a native details/summary disclosure, requiring no new browser script. Existing form field names and checkout validation remain in use.

The local content update reads `size_guides/guia-de-tallas` and `pages/guia-de-tallas`, then saves only their existing Portable Text `content` field through the development REST API. It transcribes the supplied chart into native headings, paragraphs and lists; both the product disclosure and public guide can read the measurements without interpreting an image. No schema or query changes. Publication status is retained.

`node scripts/cms/size-guide-text.mjs` applies this idempotent local update while `pnpm dev` is running. Its source is the original `guia_de_tallas.png`, retained after the transcription. Remote content migration remains part of phase 7.

## Validation

Check desktop/mobile layout and disclosure, readable measurements, independent size choices and unchanged form payload. Run typecheck, tests, local preview static build and the Impeccable detector. No deployment.

## Approved control follow-up

The user subsequently approved separate outlined pill minus/plus buttons around an editable quantity, and a pill-shaped native shipping selector. Quantity buttons use the shared 44px compact control height and remain disabled at the existing limits. Shipping retains the native select and uses an inset decorative chevron. Other text inputs keep their existing shape.
