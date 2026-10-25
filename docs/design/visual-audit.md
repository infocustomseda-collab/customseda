# Current-site visual audit — 2026-10-25

Phase 4, task 1. This document records the visual identity of the live storefront at <https://www.customseda.com/>, which is the initial visual authority for the rebuild. It is evidence, not an implementation. Later phase 4 tasks turn it into tokens and components. Each value is labelled **Preserve** (identity), **Fix** (a defect the rebuild should not copy), or **Drop** (Shopify/app chrome with no place in the new site).

## Evidence

- Theme: Shopify **Studio 15.5.0** (Dawn family), theme ID `191397233014`. Brand settings live in the inline `:root`/`.color-scheme-*` variables of every page. They were read from the phase 3 captures in ignored `backups/shopify-public-2026-10-25/` (`home.html`, product, collection and page HTML) and from the live `base.css`.
- Rendered pages: home, Conjunto `tierra`, Top `top-tierra`, collection `bikinis`, page `margarita`, page `guia-de-tallas`. Captured at 1440×900 (desktop) and 390×844 (mobile) with headless Chrome, a throwaway profile, reduced motion, and the cookie banner/popup/WhatsApp widgets hidden. Computed styles of 40 key selectors were recorded from the desktop pages.
- Evidence files are in ignored `backups/visual-audit-2026-10-25/`: full-page PNGs, `computed.json` (SHA-256 `c387816d…ebaefc`), and the logo (`logo.png`, SHA-256 `b605db05…cfb441`).
- Capture caveat: a leftover popup backdrop dims the first viewport of some screenshots. Colors below come from theme variables and computed styles, not from screenshot pixels.

## Logo and icon

| Asset | Source | Finding |
| --- | --- | --- |
| Wordmark | `cdn/shop/files/ChatGPT_Image_15_sept_2026_16_34_49.png` | Lowercase "sea" wordmark in a high-contrast, ball-terminal display serif. A daisy/sunburst replaces the "d" (half-flower, 12 petals). Raster PNG 1806×871 with transparency; the mark fills roughly the middle 50% of the canvas height. Color sampled at `#643924`. Rendered 120px wide (≈58px tall) in the header, centered, on desktop and mobile. |
| Favicon | `cdn/shop/files/logo_s.png` | A separate "s" icon, served at 32×32. |
| Social image | `og:image` → `N3A6585_…jpg` | Group photo, also the hero. |

- **Preserve:** the wordmark, its brown, centered header placement, and the daisy as a recurring motif (the announcement bar and Margarita copy already use 🌼).
- **Fix:** request the vector original (SVG/AI/PDF) from the merchant. The filename suggests a generated raster, and the canvas has large transparent margins. Until a vector exists, use a tightly cropped, optimized raster at 1×/2×. Do not trace the logo without merchant approval. The PWA icon set (phase 6) also needs the "s" icon or daisy at high resolution.

## Typography

Fonts are self-hosted by Shopify; both families are OFL-licensed Google Fonts and can be self-hosted from the official files.

| Role | Family | Weights loaded | Use |
| --- | --- | --- | --- |
| Body | **Cormorant** (serif) | 500, 500 italic, 700, 700 italic | All running text, navigation, prices, buttons, size pills, labels, footer |
| Headings | **Montserrat** (sans) | 700 | Headings, product titles, card titles, announcement bar, accordion titles |

The pairing is distinctive and inverted from the usual convention: a delicate display serif for body copy and UI, and a heavy geometric sans for headings. **Preserve it.**

Measured scale (root font size is 11px: `62.5% × 1.1`):

| Element | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| Body | Cormorant 500, 17.6px / 30.4px, +0.66px tracking | 16.5px | Color is brown at 75% opacity |
| Page title (`main-page-title`) | Montserrat 700, 62.4px | — | e.g. "Guía de tallas" |
| H1 / product title / banner heading | Montserrat 700, 48px / 61px | ≈36px | Product titles and "MARGARITA" set in uppercase content |
| H2 (rich text, "También te puede gustar") | Montserrat 700, 28.8px–36px | — | Sentence case |
| H3 / card title | Montserrat 700, 21.6px | — | Card titles are uppercase content, centered |
| Accordion title | Montserrat 700, 18px | — | With a leading icon |
| Navigation | Cormorant 500, 15.4px | — | Active item underlined |
| Price | Cormorant 500, 19.8px, +1.43px tracking | — | "€50,00 EUR" format |
| Vendor line | Cormorant 500, 11px, uppercase, +1.43px | — | "SEDA" above product title |
| Announcement | Montserrat 700, 15.6px, +1.1px | wraps to 3 lines | |

- **Preserve:** the families, roles, heavy-sans/light-serif contrast, generous body line height (~1.7), and slight positive tracking.
- **Fix:** the theme requests body bold at 800 but loads only 700, so browsers synthesize it; use real weights only. Cormorant at 15px and 11px is too thin for navigation and microcopy. Raise the minimum UI size (≈16px) or use the 600/700 weights there, and keep the 11px vendor line only if it stays legible. Build the scale as Utopia fluid steps spanning the mobile and desktop values above, rather than copying Dawn's fixed breakpoints. Uppercase titles should come from content (they do today), not CSS transforms.

## Palette

Named by role; the values are exact theme values.

| Token (proposed) | Value | Where it appears | Verdict |
| --- | --- | --- | --- |
| `paper` | `#fcfcfc` | Page background, cards, secondary buttons | Preserve |
| `ink` (brown) | `#6b4f3a` | Headings, titles, prices, selected size pill fill | Preserve |
| `ink-muted` | `#6b4f3a` at 75% | Body text, navigation | **Fix:** 3.95:1 on paper, below WCAG AA 4.5:1. Use a solid darker brown for body text. |
| `logo-brown` | `#643924` | Wordmark | Preserve |
| `cacao` (dark brown) | `#603e2a` | Announcement bar, mobile hero panel background | Preserve |
| `sky` | `#badbff` | Announcement text and hero heading on cacao | Preserve on cacao (6.61:1). **Fix:** over photographs it is washed out ("MARGARITA" on the desktop hero). |
| `butter` (yellow) | `#fdf4aa` | "Primera colección" band; primary pill button ("Ver colección") | Preserve |
| `rust` | `#6b3818` | Text on butter buttons, secondary button text and border | Preserve (8.48:1 on butter, 9.29:1 on paper) |
| `sand-tint` | `#f6f5f5` (`ink` at 4% over paper) | Multicolumn card panels ("El patrón / La costura / El tejido") | Preserve as a surface tint |
| `navy` / `teal` | `#103948`, `#18566c` | Default Dawn primary button, unused schemes 3 and 5 | Drop unless the merchant confirms; not visible in rendered sections |
| `sun` | `#ffd600` with `#6c2d2d` | "featured-buy-yellow" scheme, not seen rendered | Drop unless confirmed |

The product photography supplies the rest of the color: saturated Atlantic blue sky and sea, beach sand, and the swimwear colors (caoba, rojo, turquesa, dorado). The interface palette stays warm and quiet so photography leads.

## Layout and spacing

- **Page width:** 1320px max (`120rem`) with 55px side padding on desktop and ≈16px on mobile. The header and footer use the same container.
- **Header (desktop):** search icon left, centered logo, locale selector + account + cart right, then a centered single-row nav below the logo (Inicio, Bikinis, Colección, Sobre Seda, Envíos y Devoluciones, Contacto). Padding 20px top/bottom. Sticky.
- **Header (mobile):** hamburger left, centered logo, search + cart right.
- **Announcement bar:** full-width cacao band above the header, single centered message.
- **Section rhythm:** sections sit flush (0 section spacing); each colored band carries its own vertical padding of about 27–40px mobile and 36–52px desktop. The rhythm comes from alternating full-bleed photos and colored bands.
- **Grids:** 40px gaps on desktop, 20px on mobile. Collection grid: 3 columns on desktop at 1440px, 2 on mobile. Related products: 4 columns on desktop, 2 on mobile.
- **Homepage sequence:** announcement → header → full-bleed hero image with centered heading, subtitle, butter button → featured product (Tierra) with buy box → full-bleed slideshow (5 slides) → butter "Primera colección" text band → three process cards (pattern, sewing, fabric) on sand-tint panels → footer. Two empty placeholder slideshows also render on the live homepage (**Fix:** do not reproduce).
- **Product page:** two columns on desktop, gallery left (~60%) and sticky-feeling buy box right. Gallery is stacked: the first image is large and the rest form a 2-column grid. On mobile the gallery is a swipeable slider with a counter (1/7) above the buy box.
- **Margarita page:** centered uppercase heading and intro paragraph, then alternating rows of three square photos and short centered paragraphs, ending with a butter button.
- **Footer:** light, minimal; social icons, locale selector, payment icons, legal links.

## Shape, borders, and depth

| Element | Value | Verdict |
| --- | --- | --- |
| Buttons | Full pill (40px radius), 1px border, 52px tall, 33px side padding; very faint shadow (2px 2px 5px, 10%) | Preserve the pill and border; the shadow is optional |
| Size pills | Pill, 1px border at 55% opacity, 39px tall; selected state is filled `ink` with paper text | Preserve |
| Badges ("Agotado") | Pill (44px radius), paper on photo, bottom-left of the card image | Preserve the shape; copy will follow made-to-order availability |
| Inputs / quantity | 2px radius, 1px border at 15% opacity | Preserve |
| Product, card, and collection media | Square corners, no border, no shadow | Preserve |
| Drawer / popup | Square corners; popup shadow 6px 6px 25px at 10% | Preserve the restraint |
| Accordion | Hairline rules above and below | Preserve |

The overall language is flat with no shadows: rounded pills for controls and square edges for photographs.

## Image ratios

| Context | Ratio | Notes |
| --- | --- | --- |
| Product card | **4:5 portrait** (measured 273×341) | Centered title and price below; second image swaps on hover (`media--hover-effect`) |
| Product gallery | Original ratio, mostly 3:4 and 9:16 portrait | First image large, then 2-up grid; no cropping |
| Featured product on home | Original ratio | |
| Hero banner | Adapts to image; the hero source is ≈3:2 | Mobile puts the text on a cacao panel below the image |
| Slideshow | Medium-height full-bleed crop | |
| Process cards, Margarita grid | **1:1 square** | |

## Motion

- Scroll reveal: `slideIn` (translateY 2rem + fade from 0.01 opacity) and `fadeIn`, with `--duration-extra-long` 0.6s and easing `cubic-bezier(0, 0, .3, 1)` (`--ease-out-slow`). Disabled under reduced motion.
- Hover: underline on nav items, secondary image swap on product cards, a 0.1s border-thickening effect on buttons. Theme durations are 0.1 / 0.2 / 0.3 / 0.5 / 0.6s. The card hover-lift effects present in the theme CSS are not enabled.
- Image load: 0.4s opacity fade, `cubic-bezier(.25, .46, .45, .94)`.
- **Preserve:** quiet, short, eased-out motion; the image swap on cards; subtle reveal. Phase 6 adds the planned view transitions on top, and they should match this restrained character. Keep everything off under `prefers-reduced-motion`.

## Voice and copy cues

Spanish, warm, first-person-plural craft story ("Todo empieza en el papel…", "hecho con mucho amor por una andaluza en Canarias"), with occasional emoji (🌼, ✨). Free-shipping thresholds lead the announcement bar. The copy is already imported as CMS content in phase 3 and should not be rewritten without merchant approval.

## Drop (Shopify and app chrome)

"Comprar con Shop" and "Más opciones de pago" buttons, "Seguir en Shop", the Shopify cookie banner styling, the Hoppy email-collection popup (replaced by the editable popup), the floating WhatsApp button (keep only if the merchant wants a contact link), "Precio habitual"/"Oferta" sale markup, locale/currency selector (Spanish/EUR only for now), and the "© 2026, Seda Tecnología de Shopify" footer credit.

## Carry-forward decisions for the next tasks

1. Token set: the palette roles above, with `ink-muted` replaced by an AA-compliant solid brown; `navy`, `teal` and `sun` stay out unless the merchant confirms them.
2. Utopia type scale from 16.5–17.6px body to 48–62px display, using Cormorant (body/UI) and Montserrat 700 (headings). Pick real weights only, and use a larger UI minimum than today.
3. Space scale anchored on the measured 20/40px grid gaps and 27–52px band padding; 1320px container with fluid gutters.
4. Components to build first: announcement bar, header (desktop and mobile variants), pill button (butter primary, paper/rust secondary), size pill group, product card (4:5, hover swap), stacked gallery / mobile slider, colored text band, square photo grid, accordion, footer.
5. Open asks for the merchant: a vector logo and the favicon/PWA icon source, and whether the WhatsApp contact and any of the unused navy/teal/yellow schemes should survive.
