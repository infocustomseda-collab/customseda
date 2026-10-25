# Phase 4 storefront audit — 2026-10-25

Phase 4, task 10: a bounded audit of desktop/mobile consistency, keyboard navigation, contrast, focus, forms and long content, followed by one fix pass. Local development server, imported draft content, headless Chrome.

## Method

- **Pages:** home, combined catalog, a Conjunto (`marea`), a size-less piece (`braguita-flow`), Margarita story, shipping/returns (long content), contact, Sobre Seda, and the 404 page.
- **Viewports:** 1440×900, 390×844 and 320×700; text scaled to 200% through the root font size at each width.
- **axe-core 4.10.2:** WCAG 2.0/2.1/2.2 A and AA plus best practices, on every page, and inside the open popup.
- **Interactive targets:** checked against WCAG 2.2 2.5.8 (24×24 CSS px). Inline links inside sentences are exempt. Product card title links are excluded because the whole card is the link target.
- **Keyboard:** a 30-stop Tab walk on the catalog checking visible focus on every stop, plus the skip link. The popup was checked separately for focus entry, trapping, Escape and focus return.
- **Impeccable detector:** run on source and on rendered pages at both widths.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| P1 | Margarita photo strips scroll horizontally on phones but could not be reached by keyboard (axe `scrollable-region-focusable`). | Strips are focusable, labelled lists. |
| P1 | Horizontal scrolling at 200% text on every mobile page: header logo and display headings sized in rem without a viewport cap; catalog sort `<select>`; contact email; quantity stepper. | Logo and display sizes capped by viewport width; headings hyphenate and break long words; select, email and stepper can shrink; layout tracks use `minmax(0, 1fr)`. |
| P1 | Desktop nav links 22 px tall and mobile footer links 17 px tall (WCAG 2.2 2.5.8). | Both at least 24 px tall. |
| P2 | `/products/marea` overflowed at 320 px: "Incluye" items could not wrap. | Items drop to one column and wrap. |
| P2 | Announcement bar outside any landmark (axe `region`, every page). | Rendered as `<aside aria-label="Aviso">`. |
| P2 | Catalog card titles jumped from `h1` to `h3` (axe `heading-order`). | Catalog cards use `h2`. |
| P2 | Announcement text wrapped to three lines on phones at 1.2 line height. | 1.4 line height. |
| P3 | Full Open Props easings file shipped unused elastic curves. | Only `--ease-out-3` is emitted, generated from the pinned package (`pnpm design:open-props`). |

## Result after the fix pass

- axe: no violations on any audited page at 1440 and 390 px, and none inside the open popup.
- No horizontal scrolling at 1440, 390 or 320 px, at normal or 200% text.
- No standalone interactive target below 24×24 px.
- Keyboard: the skip link moves focus to the main content. Every Tab stop shows a focus ring (2 px rust outline; selected pills and the product card outline the visible element). The popup takes focus on "Cerrar", keeps focus inside, closes on Escape and returns focus.
- Contrast: the semantic text/surface pairs are tested at AA in `tests/design-tokens.test.mjs`. The hero copy sits on a cacao scrim; the light blue on cacao is 6.6:1.
- Forms: catalog filters are labelled fieldsets of native checkboxes, plus a labelled select. Size pickers are required native radio groups with legends. The quantity input is labelled, with labelled step buttons. Field errors are linked with `aria-describedby`.

## Kept deliberately

- **Announcement letter-spacing** (detector `wide-tracking`): the current site's bar is letter-spaced Montserrat Bold (≈0.07em). It's a short UI string, and the identity takes precedence.
- **Disabled "Añadir al carrito"** has an explanatory note until the phase 5 cart.

## Not covered here

- Real device and screen reader testing (VoiceOver, TalkBack), and touch gesture behavior beyond emulated viewports.
- Performance and image weight: original photos are served at full size until phase 6 creates responsive derivatives.
- Content structure: imported shipping and privacy headings are plain paragraphs; an editor can restore heading styles.
