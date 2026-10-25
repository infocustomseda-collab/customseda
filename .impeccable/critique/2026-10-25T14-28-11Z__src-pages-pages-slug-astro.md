---
target: /pages/envios-y-devoluciones
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/lg/works/customseda/src/pages/pages/[slug].astro"
target_fingerprint: "sha256:a40ffd7713eade6c2024f2e90ce7327bf712203b7b234503b98ccb218c1cbefb"
target_path: /Users/lg/works/customseda/src/pages/pages/[slug].astro
timestamp: 2026-10-25T14-28-11Z
slug: src-pages-pages-slug-astro
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | 5-screen page, no sense of position or section index |
| 2 | Match System / Real World | 3 | Plain zones and €, but "checkout"/"DUA" jargon; EU listed while EU shipping is disabled |
| 3 | User Control and Freedom | 2 | No jump links on ~5,200px of mobile scroll |
| 4 | Consistency and Standards | 1 | Breaks DESIGN.md heading hierarchy; "Custom Seda" vs "Seda" |
| 5 | Error Prevention | 2 | Customs/IVA and address warnings buried mid-page |
| 6 | Recognition Rather Than Recall | 1 | Labels and values are separate identical paragraphs |
| 7 | Flexibility and Efficiency | 1 | Phone, WhatsApp, email not tappable |
| 8 | Aesthetic and Minimalist Design | 1 | Wall of ~65 equal-weight paragraphs |
| 9 | Error Recovery | 2 | Defect/damage procedure last, nothing actionable |
| 10 | Help and Documentation | 2 | Content complete but unfindable |
| **Total** | | **17/40** | **Poor** |

## Design Specificity Verdict
LLM: generic plain-text dump; only Cormorant body + Montserrat h1 carry the brand. Deterministic: source scan clean (0); rendered scan 2 warnings (wide-tracking on announcement bar, borderline FP; dark-glow, FP: low-alpha offset shadows on a light page). Overlay not injected (no injectable browser tool); URL-mode detector used as fallback.

## Root cause
Import (scripts/import/shopify-plan.mjs:22-25, portableTextFromHtml) flattens HTML to plain paragraphs. Live page has 2 h3, 10 h4, 4 ul, 2 ol, strong/em, mailto; local has 1 h1 + 65 p. Same flattening affects /blogs/noticias (reference page), whose images also moved below the text.

## Priority Issues
- [P0] Rich-text structure lost on import (headings, lists, bold, links; sentences split across paragraphs). Fix: re-convert from retained shopify_source HTML keeping h3→h2, h4→h3, lists, strong/em, links; copy untouched. Applies to all imported pages incl. noticias.
- [P1] No wayfinding on a 5-screen page. Fix: short jump-link index or Disclosure sections.
- [P1] Contacts not tappable. Fix: mailto: (live had it), tel:/wa.me links.
- [P2] Zone info split across times/pickup/costs. Fix: present per zone; merging sections is a copy change needing merchant approval.
- [P2] Copy contradicting product truth (needs merchant): no production lead time, EU listed while disabled, "Custom Seda", one-step "¿Cómo funciona?", emoji as heading glyphs.

## Persona Red Flags
Casey: first fact below fold, costs on screen 3. Jordan: can't pair "Gran Canaria:" with its value; DUA/checkout unexplained. Sam: one heading, 65 flat paragraphs, emoji announced, no links. Tenerife shopper from Instagram: must infer "Resto de Islas Canarias", find cost two sections later, never learns production time.

## Minor Observations
Meta description built from whole page text; check truncation. 1440 view: narrow column with no hierarchy looks unfinished. Live mobile has no gutter — rebuild already fixes it.

## Questions to Consider
Shipping zones as structured data reused by page/popup/bar? A 3-line summary above the full policy? Why is production time missing from the "when will it arrive" page?
