# Checkout and Stripe operations

Phase 5 uses **buy-now checkout**: each product or Conjunto page buys one item directly in Stripe Checkout. The multi-item cart is phase 8. Stripe Dashboard is the order system; EmDash has no order screens.

## How a purchase works

1. The product page form posts the item ID, size(s), quantity (1–10), shipping rule and the displayed price to `/api/checkout`. The form works without JavaScript.
2. The endpoint reloads the item from D1. Local development reads drafts; deployed Workers read published entries only. It refuses the purchase and returns to the product page with `?checkout=<reason>` when:
   - the item is Agotado (no size left in its material, or in any component's for a bundle) or unpublished (`unavailable`);
   - a size is not supported by that piece (`size`);
   - the database price differs from the price the page showed (`price`);
   - the shipping rule is disabled or unknown (`shipping`);
   - Stripe is not configured (`config`) or did not answer (`stripe`).
3. Otherwise it creates a Stripe Checkout Session with one line item. For example, "Conjunto Fuego" has the description "Top Fuego: M · Braguita Flow: S". The session uses the database price, a fixed shipping charge (free from the rule's threshold), Spanish locale and EUR. Stripe collects the address (countries from the rule), phone number and payment. Pickup sends no Stripe shipping option and collects no address. Items priced below Stripe's 0,50 € minimum count as unavailable.
4. Stripe redirects to `/checkout/gracias`. That page asks Stripe for the session state and shows paid, "en proceso" (delayed methods), or unconfirmed. `/checkout/cancelado` links back to the piece.
5. `/api/stripe/webhook` verifies the signature and records each Checkout Session event once in `customseda_payment_events`. On staging (a `SITE_MODE=preview` build reading production's data) it verifies and flags addresses but never reads or writes that table.

## What the merchant sees in Stripe Dashboard

Every payment carries the same snapshot on the Checkout Session and on the payment (PaymentIntent) metadata:

| Metadata | Meaning |
| --- | --- |
| `source` | Always `customseda`. The webhook ignores sessions without it, such as Payment Links or Dashboard checkouts in the same account |
| `item_title`, `item_kind`, `item_id`, `item_slug` | What was bought (`pieza` or `bundle`) |
| `piece_size` or indexed `component_1_title`/`component_1_size`, `component_2_title`/`component_2_size`, etc. (large bundles use ordered `components_N` JSON chunks) | Sizes to produce |
| `quantity`, `unit_price_cents`, `subtotal_cents`, `shipping_cents`, `total_cents`, `currency` | Charged amounts |
| `shipping_title`, `shipping_zone`, `shipping_rule_id` | Shipping zone the buyer chose |

The payment description reads, for example, `1 × Conjunto Fuego (Top: M · Braguita: S) · Envío: Canarias`.

The buyer chooses the destination zone before Stripe. Hosted Checkout can restrict countries but not postal codes, so the webhook compares the delivery postal code with the rule. When they don't match, for example a Península address with Canarias shipping, the webhook prefixes the payment description with **`REVISAR DIRECCIÓN · `** and adds `address_check=revisar`. Contact the buyer about the shipping difference before producing. Ceuta and Melilla always need review.

## Manual production workflow

1. **New order.** Stripe emails the merchant for successful payments (enable in Dashboard → Settings → Notifications). Open Payments, read the description and metadata, and use the customer's name, email, phone and address.
2. **Delayed methods.** Produce only when the payment shows **Succeeded**. An "incomplete"/"processing" payment may still fail.
3. **Pickup.** "Recogida en Gran Canaria" collects no address. Use the phone number or email to arrange day and time.
4. **Shipping.** Add the tracking number to the payment's notes or metadata, then email the buyer.
5. **Refunds.** Use Payments → the payment → Refund. A partial refund works for shipping differences. Stripe emails the receipt if receipts are enabled.
6. **Receipts.** Enable "Successful payments" customer emails in Dashboard → Settings → Customer emails. *To confirm with the merchant:* Stripe receipts alone, or a personal confirmation email too.

## Shipping rules

The shop offers enabled **Configuración de envío** entries (published when deployed) in zone order. Each rule has a zone, ISO country codes (none for pickup), postal-code prefixes, a price in EUR cents and an optional free-shipping threshold. These rules are not offered:

- rules without countries (except pickup);
- rules with malformed codes (not two letters) or non-numeric prefixes;
- Canarias or Península/Baleares rules without postal prefixes, because the address check depends on them.

If no rule is enabled, the page shows only a disabled buy button and the "muy pronto" note.

`pnpm cms:storefront` creates local drafts from the current "Envíos y Devoluciones" page: Canarias 6,30 € (free from 45 €, prefixes 35/38), Península y Baleares 10,90 € (free from 70 €), Recogida en Gran Canaria (free), and a **disabled** Unión Europea rule whose per-country rate is not confirmed.

**Before going live, the merchant confirms:** exact rates ("desde" prices on the old site), EU rates per country, IGIC/IVA and customs treatment (no Stripe Tax is configured), production lead times, and the shipping/returns copy.

## Setup

### Stripe account

The merchant has created the account. On 2026-11-05, the live Dashboard reported payments and payouts paused pending the account holder's identity verification. The merchant must complete that verification directly in Stripe; account creation alone does not establish readiness for real payments. The existing sandbox is named **Entorno de prueba de Custom Seda**.

The merchant requested Stripe test mode on `customseda-staging` and live mode on `customseda`. Each Worker needs its own API key and webhook signing secret. The integration rejects live API keys on preview/local runtimes and test API keys on the public production runtime; signed webhook events must match the runtime's mode too. Restricted keys (`rk_test_…` / `rk_live_…`) are supported alongside secret keys (`sk_test_…` / `sk_live_…`). This guard is a code change and takes effect after its PR is deployed.

1. Create the account, then complete business details, the payout bank account, branding (logo, colors), and statement descriptor.
2. Settings → Payment methods: choose the methods to offer (cards, Apple Pay, Google Pay; Bizum/PayPal where available).
3. Settings → Customer emails: enable successful-payment and refund receipts.
4. Developers → API keys: create a key specifically for each Worker, preferably restricted to **Checkout Sessions: Write** and **Payment Intents: Write** (which includes reading those resources). The staging key must belong to the sandbox; the production key must belong to the live account. Without PaymentIntent write access the webhook cannot flag addresses, and Stripe keeps retrying those events. Never paste key values into chat or commit them.
5. Workbench → Webhooks: add a **snapshot** endpoint from **Your account**, with a separate signing secret for each environment:
   - Sandbox → `https://customseda-staging.customseda.workers.dev/api/stripe/webhook`
   - Live → `https://customseda.customseda.workers.dev/api/stripe/webhook`

   Subscribe to these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

   Copy its signing secret (`whsec_…`).

No Stripe API version is pinned in requests. The live account's version observed on 2026-11-05 is **2026-10-28.endive**. The code reads shipping from `collected_information.shipping_details` and falls back to the older `shipping_details`. Configure snapshot destinations compatibly and verify real sandbox deliveries; mock tests alone do not establish compatibility with the account's API version.

### Local

The administrator continues to use only `pnpm dev:production`. Its launcher deliberately excludes Stripe and rebuild secrets, so payment acceptance testing belongs on the deployed staging Worker, using the sandbox. The local-only instructions below are for isolated developer infrastructure and must not be used against production data.

Add to `.env`, which is ignored:

```sh
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen` below
```

Then restart `pnpm dev`, and with it running apply the model (`pnpm cms:model`, which creates `customseda_payment_events`) and seed the shipping drafts (`pnpm cms:storefront`). Forward webhooks with the Stripe CLI:

```sh
stripe listen --forward-to http://localhost:4321/api/stripe/webhook
```

Test with Stripe's test cards. Checks: 4242 4242 4242 4242 (paid), 4000 0000 0000 0002 (declined), a delayed method such as SEPA Debit (pending → succeeded/failed), cancel on the Stripe page, a duplicate event (`stripe events resend <id>`), and a Península postal code with Canarias shipping (flagged).

### Staging and production (phase 7)

Upload `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` per environment with `wrangler secret put --env staging|production`. Staging uses test keys; only production gets live keys. Each environment gets its own webhook endpoint. `customseda.checkout.v1` is applied with the other model versions by the deployment script. The staging gate exempts `/api/stripe/webhook` (Stripe's signature protects it), so the endpoint URL carries no credentials. Staging uses production's catalog with test keys; test payments land only in Stripe test mode, never in the database.

If keys are retained locally, keep them only in the ignored `.env.cloudflare-staging` and `.env.cloudflare-production` files, with permissions 600, and activate their names with empty values in `.env.example` in the same change. Upload only the intended secret names; never send the entire shared inventory to both Workers. Secret updates create and deploy Worker versions immediately. Check the selected account, Worker and mode first, and verify both bindings and signed webhook delivery afterwards. Real purchases and refunds require merchant participation.

## Records and limits

`customseda_payment_events` stores only: Stripe event ID (primary key, which deduplicates), event type, session and PaymentIntent IDs, our status (`paid`, `pending`, `failed`, `expired`), the address check, livemode, and timestamps. It holds no names, emails, phones or addresses. Unrelated event types are acknowledged and ignored.

Known limits:

- One item per payment until the cart (phase 8). Two separate pieces mean two payments and two shipping charges.
- The thank-you page needs JavaScript-free server rendering. It stays a Worker route when public pages are prerendered in phase 6.
- Astro's `security.checkOrigin` (on by default) rejects cross-site form posts in deployed builds. The local dev server did not reject them. Sessions created by direct posts expire unpaid after 24 h.
- Pickup without a Stripe shipping option, and the webhook's API-version fields, still need confirmation in the test-mode run.

## Configuration verified — 2026-11-05

Both Workers now hold their own STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET: sandbox keys on customseda-staging, live keys on customseda. Snapshot webhooks subscribe to the four Checkout events above, using API version 2026-10-28.endive. Staging endpoint: we_1UYVYjAFacR5nQyfTt5AkEEc; production: we_1UYVrRAZJSfcbFofm7xd1QBO. Each endpoint accepted a valid signature (200, ignored event) and rejected an invalid one (400), without recording payments. Full sandbox purchase acceptance remains pending. Live payments remain paused pending merchant identity verification. The current logged-in user enabled successful-payment email notifications for the live account. No live purchase or refund was performed. Secret updates deployed Worker versions; the code guard still requires this PR deployment.
