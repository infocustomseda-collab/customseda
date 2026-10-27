# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Shoppers:** mostly women in Spain, many in Canarias, who discover Seda on Instagram or TikTok and arrive and buy on their phone. EU buyers are a minority. Their job: see how a piece looks and fits, choose sizes (independently for each piece of a set), understand shipping and that the piece is made to order, then pay.
- **Operator:** the maker runs the shop alone and is not technical. They publish products and Conjuntos, edit the homepage, popup and announcement bar in EmDash, and handle orders, refunds and shipping in the Stripe Dashboard. Admin and content workflows must stay simple enough for that person, sometimes from a phone.

## Product Purpose

Seda is a handmade swimwear shop. This project replaces the Shopify storefront at customseda.com with an Astro + EmDash shop on Cloudflare Free, keeping the approved identity and selling through Stripe Checkout. Success means a shopper coming from social media can go from a product to payment on mobile without friction, and the maker can run the catalog and orders without technical help.

## Design Scope

- The live site at <https://www.customseda.com/> is published and approved by the merchant. It is the design authority, not a draft to reinterpret.
- The work is limited to making the design consistent across pages and fixing clear UI/UX mistakes. This is not a redesign.
- Every design change, including a fix, is proposed first and applied only after the user approves it.
- Reference pages: `/blogs/noticias` (Sobre Seda) has a good layout and is a model for content pages. `/pages/envios-y-devoluciones` is a mess, a clear example of what needs fixing toward that consistency.
- Shopify features are removed because this is now a simple site with a CMS and Stripe Checkout: Shop Pay and "more payment options" buttons, "Seguir en Shop", customer accounts, search, the locale/currency selector, sale ("Oferta"/"Precio habitual") markup, the email-collection app popup (replaced by the editable popup), and the Shopify footer credit. The cart is hidden until the phase 8 multi-item cart. Whether to keep the WhatsApp button is still open with the merchant.

## Positioning

One maker cuts and sews each piece in Canarias after it is ordered ("hecho con mucho amor por una andaluza en Canarias"). The value is handmade craft and a personal story, with the process told as pattern → sewing → fabric. It does not compete on speed or price.

## Operating Context

- Traffic is social-first and mobile-first. Instagram and TikTok are the brand's channels.
- Made to order: no stock tracking, so availability means "can be ordered", not "in stock". Production lead time is part of what the buyer accepts.
- Shipping: Canarias, Península/Baleares, EU (disabled until rates are confirmed), and free pickup in Gran Canaria. Free-shipping thresholds lead the announcement bar.
- Orders, payments and refunds live in the Stripe Dashboard. EmDash has no order management.
- Spanish language and EUR.

## Capabilities and Constraints

- **Catalog:** Products (categories Top and Braguita) and Conjuntos are separate types. A Conjunto links exactly one Top and one Braguita, has its own price and gallery, is Agotado when either component has no size left, and the buyer picks each component's size separately. Sizes are XS–XL, and each product declares its supported subset. Margarita is the first collection.
- **Purchase:** buy-now, one item per Stripe Checkout, validated server-side. A multi-item cart is planned after launch (phase 8).
- **Publishing:** public pages are prerendered from a snapshot of published content, and publishing triggers a rebuild. Only `/_emdash/*`, `/api/*` and `/checkout/*` run per request.
- **Site features:** editable announcement bar and scheduled popup, view transitions from product to detail, PWA with an offline fallback (checkout stays online-only).
- **Technical:** plain CSS (CUBE CSS, Utopia fluid scales, selected Open Props); no Tailwind. Must fit Cloudflare Workers Free.
- **Undecided:** Stripe account, tax treatment (IGIC/IVA), EU rates, production/shipping copy, and the receipt approach (see `docs/checkout.md`). Products whose material has no sizes for them show "Agotado". The envíos page lists delivery times and costs in separate sections with different zone names. Once the merchant confirms the Shipping Rules, a per-zone table generated from them (so it always matches checkout) can replace that split; regrouping the merchant's text by hand was declined (2026-10-25).

## Brand Commitments

- Name: **Seda**. The wordmark is a lowercase serif where a daisy replaces the "d". The daisy (🌼) is a recurring motif. Raster wordmark at `public/brand/seda-wordmark.png`; a vector original has been requested from the merchant and must not be traced without approval.
- The current site's identity is approved and must be preserved: see `docs/design/visual-audit.md` for the recorded evidence.
- Voice: Spanish, warm, first-person-plural craft story, with occasional emoji (🌼, ✨). Imported copy is the merchant's and must not be rewritten without approval.

## Evidence on Hand

- Local catalog (drafts): 11 Products, 5 Conjuntos, 7 Pages and a size guide. Original photography is in local R2 and `assets/originals/`; see `docs/content-maintenance.md`.
- Product and lifestyle photography: Atlantic beach, sea and sky, with models wearing the pieces.
- No testimonials, reviews, press, sales figures or customer counts exist in the repo. Do not invent them.

## Product Principles

1. **The pieces and the photography lead.** The interface stays quiet so the swimwear and the handmade story come through.
2. **Mobile is the real storefront.** Every flow is judged first at phone width, on social-media traffic.
3. **Be honest about made to order.** Availability, sizing, lead time and shipping are stated plainly before payment, never implied to be stock.
4. **The maker can run it alone.** Content structures and admin workflows stay simple for a non-technical operator.
5. **Preserve, don't reinvent.** The approved live site and the merchant's copy are kept. Changes make pages consistent or fix clear defects, never just taste, and each one waits for approval.

## Accessibility & Inclusion

Target WCAG 2.2 AA: contrast (the original 75% brown body text failed and was fixed), keyboard and focus handling for the popup and size pickers, and reduced-motion support for reveals and view transitions. See `docs/design/phase4-audit.md`.
