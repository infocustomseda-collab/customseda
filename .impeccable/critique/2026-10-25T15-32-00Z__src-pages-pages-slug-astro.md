---
target: /pages/envios-y-devoluciones
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/lg/works/customseda/src/pages/pages/[slug].astro"
target_fingerprint: "sha256:a40ffd7713eade6c2024f2e90ce7327bf712203b7b234503b98ccb218c1cbefb"
target_path: /Users/lg/works/customseda/src/pages/pages/[slug].astro
timestamp: 2026-10-25T15-32-00Z
slug: src-pages-pages-slug-astro
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Sticky index has no current-section state |
| 2 | Match System / Real World | 3 | Zone names differ between sections; "checkout" |
| 3 | User Control and Freedom | 2 | ~5,300px on phone, no way back to index/top; WhatsApp opens new tab unannounced |
| 4 | Consistency and Standards | 3 | Same system as privacy/noticias; only page with emoji headings |
| 5 | Error Prevention | 2 | Missing lead time, EU listed (deferred copy); customs warning mid-page |
| 6 | Recognition Rather Than Recall | 1 | Time and cost per zone split (deferred) |
| 7 | Flexibility and Efficiency | 2 | Desktop index good; phone index lists only 2 h2s |
| 8 | Aesthetic and Minimalist Design | 2 | Long legal wall; emoji as only signposting |
| 9 | Error Recovery | 2 | Returns say "nuestro correo de soporte" with no address |
| 10 | Help and Documentation | 3 | Contact inline; page doesn't end on a contact block |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
Layout and type are Seda (inverted pair, ink on paper, hairlines, 65ch); content shape is a generic legal template. Detector: source clean; URL scans: wide-tracking on announcement bar (FP, approved live styling), tight-leading x2 on wrapped desktop sub-index links (minor). No broken anchors, duplicate ids, missing alt, inline styles.

## Priority Issues
- [P1] Phone index lists only the 2 h2s; costs/times/pickup unreachable. Fix: list h3s on phones when fewer than 4 h2s, or closed details "En esta página (12)"; optional back-to-index link. /impeccable adapt
- [P1, deferred] Time and cost per zone split; per-zone table from Shipping Rules once confirmed.
- [P2] Emoji read aloud in headings/index; wa.me opens new tab unannounced. Fix: aria-hidden emoji spans; visually hidden "(abre WhatsApp en una pestaña nueva)". /impeccable harden
- [P2] Page ends on legalese with no exit. Fix: contact block from site settings + secondary "Ver colección" via ContentPage slot; merchant: name the support email. /impeccable polish
- [P3] Desktop index weak: step -1, wraps, no current state, leading 1.25 on wrapped links. /impeccable polish

## Persona Red Flags
Casey: index doesn't reach prices (screen 2-3). Jordan: "desde" vs "calculado en pago"; no production time. Sam: emoji announced, new-tab not announced. Tenerife shopper: must match time and cost across sections; no reassurance on Canarias customs/IGIC.

## Minor Observations
"¿Cómo funciona?" bold paragraph over a one-item ordered list; no "última actualización"; h2/h3 close in size on phones.
