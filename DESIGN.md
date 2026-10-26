---
name: Seda
description: Handmade, made-to-order swimwear from Canarias; a quiet warm interface that lets the photography lead.
colors:
  paper: "#fcfcfc"
  sand: "#f6f5f5"
  ink: "#6b4f3a"
  ink-90: "#7a604d"
  ink-85: "#816957"
  ink-70: "#968374"
  ink-15: "#e6e2df"
  logo-brown: "#643924"
  cacao: "#603e2a"
  sky: "#badbff"
  butter: "#fdf4aa"
  rust: "#6b3818"
  terracotta: "#a3321f"
typography:
  display:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(2.6438rem, 2.1855rem + 2.037vw, 4.0188rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.015em"
  headline:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(2.2032rem, 1.8991rem + 1.3514vw, 3.1154rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.015em"
  title:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(1.53rem, 1.416rem + 0.5068vw, 1.8721rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.015em"
  title-small:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(1.275rem, 1.2162rem + 0.2611vw, 1.4512rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.015em"
  body:
    fontFamily: "Cormorant, Georgia, serif"
    fontSize: "clamp(1.0625rem, 1.0417rem + 0.0926vw, 1.125rem)"
    fontWeight: 500
    lineHeight: 1.7
    letterSpacing: "0.0375em"
  label:
    fontFamily: "Cormorant, Georgia, serif"
    fontSize: "clamp(0.8721rem, 0.8899rem + -0.0197vw, 0.8854rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.0625em"
  announcement:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(0.8721rem, 0.8899rem + -0.0197vw, 0.8854rem)"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.0625em"
rounded:
  media: "0"
  control: "2px"
  pill: "999px"
spacing:
  3xs: "clamp(0.2656rem, 0.2604rem + 0.0231vw, 0.2813rem)"
  2xs: "clamp(0.5313rem, 0.5208rem + 0.0463vw, 0.5625rem)"
  xs: "clamp(0.7969rem, 0.7813rem + 0.0694vw, 0.8438rem)"
  s: "clamp(1.0625rem, 1.0417rem + 0.0926vw, 1.125rem)"
  m: "clamp(1.5938rem, 1.5625rem + 0.1389vw, 1.6875rem)"
  l: "clamp(2.125rem, 2.0833rem + 0.1852vw, 2.25rem)"
  xl: "clamp(3.1875rem, 3.125rem + 0.2778vw, 3.375rem)"
  2xl: "clamp(4.25rem, 4.1667rem + 0.3704vw, 4.5rem)"
  3xl: "clamp(6.375rem, 6.25rem + 0.5556vw, 6.75rem)"
  gutter: "clamp(1.0625rem, 0.2917rem + 3.4259vw, 3.375rem)"
  grid-gap: "clamp(1.0625rem, 0.6667rem + 1.7593vw, 2.25rem)"
  band: "clamp(1.5938rem, 1rem + 2.6389vw, 3.375rem)"
  section: "clamp(1.5938rem, 0.625rem + 4.3056vw, 4.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "{spacing.2xs} clamp(1.5938rem, 1.375rem + 0.9722vw, 2.25rem)"
    height: "3.25rem"
  button-accent:
    backgroundColor: "{colors.butter}"
    textColor: "{colors.rust}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "{spacing.2xs} clamp(1.5938rem, 1.375rem + 0.9722vw, 2.25rem)"
    height: "3.25rem"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.rust}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "{spacing.2xs} clamp(1.5938rem, 1.375rem + 0.9722vw, 2.25rem)"
    height: "3.25rem"
  size-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 {spacing.s}"
    height: "2.5rem"
  size-pill-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
  text-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "{spacing.2xs} {spacing.s}"
    height: "3.25rem"
  badge:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "{spacing.3xs} {spacing.xs}"
  announcement-bar:
    backgroundColor: "{colors.cacao}"
    textColor: "{colors.sky}"
    typography: "{typography.announcement}"
    padding: "{spacing.2xs} {spacing.gutter}"
  process-card-body:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink-90}"
    rounded: "{rounded.media}"
---

# Design System: Seda

## Overview

**Creative North Star: "The Seamstress's Notebook"**

Seda's story starts on paper ("Todo empieza en el papel…"): a pattern, then the sewing, then the fabric. The interface is that notebook. It is near-white paper written in warm brown ink, with a few warm colors that frame the sunlit Atlantic photography and never compete with it. The mood is warm, calm and handmade: unhurried, intimate, and confident because it is personal.

The approved live site at customseda.com is the authority, and this file records it as rebuilt in plain CSS. Its signature is an inverted type pairing: a delicate display serif (Cormorant) carries body copy and every control, while a heavy geometric sans (Montserrat 700) carries headings. Space is generous, motion is short and eased out, and depth is almost absent. Rhythm comes from full-bleed photographs alternating with flat colored bands (cacao, butter, sand), not from cards or shadows.

Values differ from the live theme only where the phase 4 accessibility audit fixed a defect: solid ink tints replace the live site's 75%-opacity body text (which failed AA), a terracotta color was added for form errors, and a cacao scrim keeps hero text legible over photographs. Anything else is a change to an approved design and needs the merchant's approval first.

**Key Characteristics:**
- Paper and brown ink; the photography supplies the saturated color.
- Serif for reading and controls, heavy sans for headings: never swapped.
- Pill-shaped controls, square photographs.
- Flat colored bands set the page rhythm.
- Quiet motion: 0.1–0.6s, eased out, off under reduced motion.

## Colors

A warm, quiet palette of browns on near-white paper, with two light accents (butter, sky) used sparingly against cacao and rust.

### Primary
- **Workshop Ink** (`ink`): headings, prices, strong text, the filled primary button and the selected size pill. It is the brand's voice color.
- **Wordmark Brown** (`logo-brown`): reserved for the wordmark. It isn't used as a UI color.

### Secondary
- **Cacao** (`cacao`): the announcement bar, the mobile hero panel and the hero scrim, the update banner. It is the only dark surface.
- **Atlantic Sky** (`sky`): text on cacao only (6.61:1). Never place it on paper or directly over a photograph.

### Tertiary
- **Butter** (`butter`): the "Primera colección" band, the accent button, text selection. It is a surface, never a text color.
- **Rust** (`rust`): text on butter, the secondary button's text and border, focus rings (8.48:1 on butter, 9.29:1 on paper).
- **Terracotta** (`terracotta`): form errors only (6.75:1 on paper). Added in the rebuild; it is not part of the live palette.

### Neutral
- **Paper** (`paper`): the page, cards, header, drawers, popup, secondary buttons.
- **Sand** (`sand`): the tinted surface of process-card captions and image placeholders.
- **Ink 90** (`ink-90`): running body text, replacing the live site's 75%-alpha brown.
- **Ink 85** (`ink-85`): subtle text such as hints, counts, color lines and legal text.
- **Ink 70** (`ink-70`): control borders (inputs, size pills, quantity stepper), disabled glyphs.
- **Ink 15** (`ink-15`): hairlines such as header and footer rules, accordion and toolbar dividers.

### Named Rules
**The Quiet Frame Rule.** The interface never brings its own saturated color. Saturation belongs to the photographs and the swimwear; the UI stays in browns, paper, butter and sky.

**The Sky-on-Cacao Rule.** Sky text appears only on a cacao surface or cacao scrim. On paper or bare photographs it washes out, which is the defect the live hero had.

**The No-Alpha-Text Rule.** Text color is always a solid token. Tinting text with opacity is what made the live body text fail AA.

## Typography

**Display Font:** Montserrat 700 (with sans-serif)
**Body Font:** Cormorant 500/600/700, italic 500/700 (with Georgia, serif)

**Character:** The pairing is inverted on purpose: the fragile, high-contrast serif carries reading and interaction, and the heavy sans carries headings. That contrast is the identity. Both families are self-hosted from fontsource (Latin subset) through Astro's Fonts API.

### Hierarchy
- **Display** (Montserrat 700, Utopia step 5, 1.05): hero title only, capped at `15vw` on phones.
- **Headline** (Montserrat 700, step 4, 1.25): page `h1`, product titles, featured product title, story headings.
- **Title** (Montserrat 700, step 2, 1.25): section `h2` such as "También te puede gustar".
- **Title small** (Montserrat 700, step 1, 1.25): `h3`, process-card titles, the mobile drawer menu; accordion summaries use step 0.
- **Body** (Cormorant 500, step 0 ≈ 17–18px, 1.7, +0.0375em): all running text, with a reading measure of 65ch.
- **Label** (Cormorant 700, step −1 ≈ 14px, +0.0625em): field labels, legends, badges, contact labels, the sort control. Buttons, size pills and prices use the same weight and tracking at step 0 or step 1.
- **Announcement** (Montserrat 700, step −1, 1.4, +0.0625em): the announcement bar only.

### Named Rules
**The Inverted Pair Rule.** Montserrat is for headings and the announcement bar. Cormorant is for everything else, including buttons, prices, navigation and labels. Never set body copy in Montserrat or headings in Cormorant.

**The Content-Case Rule.** Uppercase titles ("MARGARITA", product names) come from the CMS content, never from `text-transform`.

**The Real-Weight Rule.** Use only loaded weights (Cormorant 500/600/700, Montserrat 700). The live theme requested 800 and browsers synthesized it.

## Layout

- **Container:** 82.5rem (1320px) of content with fluid gutters, from about 17px on phones to 54px at 1440px. Header, footer and page content share it.
- **Scales:** Utopia fluid type and space between 360px and 1440px viewports, generated by `pnpm design:fluid`. Use the `--step-*` and `--space-*` tokens; don't hand-write sizes.
- **Bands:** sections sit flush. Each colored band (cacao, butter, sand) carries its own vertical padding (`band`: about 26px on phones to 54px wide). Pages alternate full-bleed photographs and bands, and the footer is separated by the `section` gap.
- **Grids:** the product grid has two columns on phones and three (or four for related items) from 60rem, with row gaps `l`–`xl`. Process cards and story photos sit in three columns from 48rem. Story photos are a horizontal snap strip on phones.
- **Product detail:** gallery (3fr) beside a sticky details column (2fr, at least 20rem) from 60rem, stacked below that. The gallery is a swipeable 4:5 strip with a counter on phones, and the first image runs full width above two masonry columns on wide screens. A small client layout places each remaining photo in the shortest column, preserving original ratios and CMS order in the markup. It recalculates on resize from the image dimensions; the two-column grid remains the fallback without JavaScript.
- **Content pages:** two layouts.
  - **Normal pages** (envíos, privacy policy, Contacto, conjuntos, size guide): a centered reading column of 48rem (prose at 65ch). With a section index the centered block is the text column (as wide as the 65ch measure) plus a 14rem index on its right, separated by `--space-l-xl` (54px at 1440px), the same gap as the site's other two-column blocks.
  - **Pages that open with a photo** (noticias, `/blogs/noticias` is the reference): the full page width, text on the left and the photo on the right.
  - **Lead photo:** when the content starts with a photo and has text after it, the photo sits above the text on phones and to the right of it (3fr text / 2fr photo) from 48rem, at full page width. That is the live "Sobre Seda" composition.
  - **Trailing photos:** photos after the text run at page width.
  - **Section index:** pages with 4 or more h2/h3 headings get an "En esta página" index. On phones it is one closed "En esta página (N)" disclosure under the title that opens the full list; from 60rem it is a sticky 14rem column to the right of the text, with its h3s nested. Anchored headings clear the sticky header (6rem on phones, 10rem from 60rem).
- **Breakpoints:** 48rem (tablet: hero overlay, three-column cards, footer row) and 60rem (desktop: nav row, split detail, catalog filters inline).
- **CSS architecture:** CUBE CSS in cascade layers `reset, tokens, global, compositions, blocks, utilities, exceptions`. Compositions (`wrapper`, `stack`, `cluster`, `grid`, `split`) know nothing about content. Blocks consume semantic tokens only, never the `--seda-*` primitives.

## Elevation & Depth

The system is flat. Depth comes from tonal bands and hairline rules, not shadows. Two shadows survive from the live theme. A faint shadow under buttons is kept as on the live site. A soft overlay shadow marks surfaces that float above the page: the popup, the mobile nav drawer and the update banner. Overlay backdrops are cacao at 35% (drawer) and 45% (popup). The product grid, cards, media and bands never cast a shadow.

### Shadow Vocabulary
- **Control** (`box-shadow: 2px 2px 5px rgb(96 62 42 / 0.1)`): buttons at rest. On hover, a 1px inset ring is added to thicken the border without moving the layout.
- **Overlay** (`box-shadow: 6px 6px 25px rgb(96 62 42 / 0.12)`): popup, nav drawer, update banner.

### Named Rules
**The Flat Band Rule.** New surfaces separate themselves with a band color or a hairline (`ink-15`), never with a new shadow.

## Shapes

Two forms define the system: pills for anything you press or choose (999px radius for buttons, size pills, category tabs, badges, icon buttons) and square edges for anything you look at (0 radius for photographs, cards, bands, popup and drawer). Text inputs and the quantity stepper are the exception, nearly square at 2px, with a 1px `ink-70` border. Borders are always 1px. Photographs use fixed ratios: 4:5 portrait for product cards and the mobile gallery, 1:1 for process cards and story photos, 3:2 for the mobile hero, 16:7 for the wide slideshow. The desktop gallery keeps each photo's original ratio.

## Components

### Buttons
Soft, rounded and quietly tactile.
- **Shape:** full pill (999px), 1px border, at least 3.25rem tall.
- **Primary:** Workshop Ink fill with paper text, Cormorant 700 at step 0 with +0.0625em tracking.
- **Accent:** butter fill with rust text, the "Ver colección" button on bands and the hero. On hover its border turns rust.
- **Secondary:** paper fill with rust text and border.
- **Hover / Focus:** a 1px inset ring thickens the border in 0.1s. Focus shows a 2px rust outline offset by 3px (sky on cacao). Disabled is 50% opacity with no shadow, and busy shows an inline spinner.
- Rendered as a link when given an `href`, otherwise as a native button.

### Size pills (chips)
- **Style:** native radios behind pill labels, 2.5rem tall and at least 3.25rem wide, with a 1px `ink-70` border and Cormorant 700 ink text.
- **State:** hover darkens the border to ink. Selected fills with ink and paper text. An unavailable size has a dashed border, subtle text and a line-through. The group's error state gives every pill a terracotta border.
- Catalog categories use a separate row of text navigation with an underline for the current category. Attribute pills are reserved for color choices inside the filter disclosure.

### Catalog navigation and refinements
- Categories remain visible as text links, with a brown underline identifying the current selection. They refine the existing grid through `?category=todos|conjuntos|tops|braguitas`, without a page swap.
- A toolbar with vertical padding contains a filter disclosure button, result count and sort select. Filters expand into their own full-width row in the page flow, pushing products down with an animated height and rotating the arrow 180°. Collapsed controls are inert; Escape closes the panel. Motion is instant with reduced motion. Color and availability are secondary; no catalog size filter is offered.
- Grid changes use a short exit fade followed by FLIP movement into the new positions; returning cards fade in. Motion uses existing 200/600/300ms timing tokens and is immediate for reduced motion or initial rendering.
- Active filters remain visible as removable chips with a reset when the disclosure is closed. Color, availability and sorting remain selected across category changes, including empty combinations. Direct URLs and browser Back/Forward restore the grid state.

### Product cards
- **Corner style:** square, with no border or shadow.
- **Media:** 4:5 on a sand placeholder. On hover-capable devices the second photo fades in over 0.3s.
- **Content:** centered title (Montserrat 700, step 0) and price (Cormorant 700, step 0, tabular figures). The whole card is one link, and focus outlines the whole card.
- **Badge:** a paper pill, bottom-left on the photo, for availability states.
- **Catalog metadata:** a quiet Cormorant line identifies product type and color below the unchanged merchant title.

### Inputs / Fields
- **Style:** paper background, 1px `ink-70` border, 2px radius, 3.25rem tall, ink text, `ink-85` placeholder.
- **Labels:** label style (Cormorant 700, step −1) in ink, above the control, with hints below in `ink-85`.
- **Focus:** the global 2px rust outline. Hover darkens the border to ink.
- **Error:** terracotta border plus a 1px inset ring, and a terracotta bold message.
- **Quantity stepper:** minus, number, plus in one bordered 2px-radius control.

### Navigation
- **Announcement bar:** a full-width cacao band with sky Montserrat text, centered and balanced (it wraps to three lines on phones).
- **Header:** sticky, paper with an `ink-15` bottom rule. Wordmark centered (6.25–7.5rem wide). From 60rem a centered single row of Cormorant links in ink; hover and the current page show an underline. The current-page underline moves between links during page transitions, using the shared motion timing and respecting reduced motion.
- **Mobile:** a hamburger opens a native popover drawer from the left (at most 22rem), with Montserrat 700 links at step 1 and an overlay shadow over a cacao backdrop.
- **Footer:** small Cormorant text (step −1) on paper above an `ink-15` rule. Wordmark, link clusters and social links, then subtle legal text.

### Disclosures (accordions)
Hairline `ink-15` rules above and below, a Montserrat 700 summary at control height, and a chevron that rotates 180° in 0.2s. Used for product details and the size guide.

### Popup
A native modal dialog: square paper card (at most 26rem), optional 4:3 image, centered stack, overlay shadow, cacao backdrop at 45%. It fades and scales in from 0.96 over 0.3s.

### Hero
On phones, the photo (3:2) sits above a solid cacao panel with sky text. From 48rem the copy sits over the photo on a cacao gradient scrim (88% → 60% → transparent), anchored to the bottom.

### Process cards
A square photo over a sand caption panel with a centered step-1 title, three across from 48rem. The panel has the same inset on all four sides (`--space-m-l`: 26px on phones, 36px on desktop). These are the "El patrón / La costura / El tejido" story.

### Slideshow
A full-bleed strip with a centered `< 1 / 5 >` counter below it. The counter has the same space above and below (`--space-xs`), so it belongs to the photos and never touches the next band.

## Do's and Don'ts

### Do:
- **Do** use only the semantic tokens (`--color-text`, `--color-action`, `--color-surface-tint`…) in blocks; primitives (`--seda-*`) live only in `tokens.css`.
- **Do** keep controls pill-shaped and photographs square-edged.
- **Do** set every size and spacing value from the Utopia `--step-*` and `--space-*` scales.
- **Do** separate sections with flat bands or `ink-15` hairlines.
- **Do** keep motion within 0.1–0.6s, eased out (`cubic-bezier(0, 0, .3, 1)`), and zeroed under `prefers-reduced-motion`.
- **Do** keep text at AA: solid ink tints on paper, sky only on cacao, rust on butter.
- **Do** model content pages on `/blogs/noticias`: one centered 48rem column, prose at 65ch.

### Don't:
- **Don't** change an approved live-site value (color, type, shape, layout) without the merchant's approval. Fixes go through approval too.
- **Don't** set body text, buttons or prices in Montserrat, or headings in Cormorant.
- **Don't** tint text with opacity.
- **Don't** add new shadows, gradients or rounded photographs. The only gradient is the hero scrim.
- **Don't** introduce saturated UI colors. The navy, teal and yellow theme schemes of the Shopify theme are dropped.
- **Don't** use `text-transform: uppercase` for titles. Case comes from content.
- **Don't** bring back Shopify chrome: Shop Pay and payment-option buttons, sale/"Precio habitual" markup, locale selector, account and search icons.
- **Don't** trace or redraw the wordmark. Use the supplied raster until the merchant provides a vector.
