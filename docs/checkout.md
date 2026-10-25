# Checkout and Stripe operations

Phase 5 uses **buy-now checkout**: each product or Conjunto page buys one item directly in Stripe Checkout. The multi-item cart is phase 8. Stripe Dashboard is the order system; EmDash has no order screens.

## How a purchase works

1. The product page form posts the item ID, size(s), quantity (1–10), shipping rule and the displayed price to `/api/checkout`. The form works without JavaScript.
2. The endpoint reloads the item from D1. Local development reads drafts; deployed Workers read published entries only. It refuses the purchase and returns to the product page with `?checkout=<reason>` when:
   - the item, or either Conjunto component, is unavailable or unpublished (`unavailable`);
   - a size is not supported by that piece (`size`);
   - the database price differs from the price the page showed (`price`);
   - the shipping rule is disabled or unknown (`shipping`);
   - Stripe is not configured (`config`) or did not answer (`stripe`).
3. Otherwise it creates a Stripe Checkout Session with one line item. For example, "Conjunto Fuego" has the description "Top: M · Braguita: S". The session uses the database price, a fixed shipping charge (free from the rule's threshold), Spanish locale and EUR. Stripe collects the address (countries from the rule), phone number and payment. Pickup sends no Stripe shipping option and collects no address. Items priced below Stripe's 0,50 € minimum count as unavailable.
4. Stripe redirects to `/checkout/gracias`. That page asks Stripe for the session state and shows paid, "en proceso" (delayed methods), or unconfirmed. `/checkout/cancelado` links back to the piece.
5. `/api/stripe/webhook` verifies the signature and records each Checkout Session event once in `customseda_payment_events`.

## What the merchant sees in Stripe Dashboard

Every payment carries the same snapshot on the Checkout Session and on the payment (PaymentIntent) metadata:

| Metadata | Meaning |
| --- | --- |
| `source` | Always `customseda`. The webhook ignores sessions without it, such as Payment Links or Dashboard checkouts in the same account |
| `item_title`, `item_kind`, `item_id`, `item_slug` | What was bought (`pieza` or `conjunto`) |
| `piece_size` or `top_title`/`top_size` and `braguita_title`/`braguita_size` | Sizes to produce |
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

### Stripe account (pending)

The merchant creates the account. Use test mode until phase 7.

1. Create the account, then complete business details, the payout bank account, branding (logo, colors), and statement descriptor.
2. Settings → Payment methods: choose the methods to offer (cards, Apple Pay, Google Pay; Bizum/PayPal where available).
3. Settings → Customer emails: enable successful-payment and refund receipts.
4. Developers → API keys: copy the **test** secret key (`sk_test_…`). A restricted key also works if it can write Checkout Sessions and read and write PaymentIntents. Without PaymentIntent write access the webhook cannot flag addresses, and Stripe keeps retrying those events.
5. Developers → Webhooks: add an endpoint `https://<host>/api/stripe/webhook` for these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

   Copy its signing secret (`whsec_…`).

No Stripe API version is pinned. The code reads shipping from `collected_information.shipping_details` and falls back to the older `shipping_details`. Once the account exists, record the account's API version here.

### Local

Add to `.dev.vars`, which is ignored:

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

Upload `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` per environment with `wrangler secret put --env staging|production`. Staging uses test keys; only production gets live keys. Each environment gets its own webhook endpoint. `customseda.checkout.v1` is applied with the other model versions by the deployment script. While the staging foundation gate is locked, include its Basic credentials in the webhook URL (`https://seda:<token>@…/api/stripe/webhook`). Otherwise Stripe receives 401.

## Records and limits

`customseda_payment_events` stores only: Stripe event ID (primary key, which deduplicates), event type, session and PaymentIntent IDs, our status (`paid`, `pending`, `failed`, `expired`), the address check, livemode, and timestamps. It holds no names, emails, phones or addresses. Unrelated event types are acknowledged and ignored.

Known limits:

- One item per payment until the cart (phase 8). Two separate pieces mean two payments and two shipping charges.
- The thank-you page needs JavaScript-free server rendering. It stays a Worker route when public pages are prerendered in phase 6.
- Astro's `security.checkOrigin` (on by default) rejects cross-site form posts in deployed builds. The local dev server did not reject them. Sessions created by direct posts expire unpaid after 24 h.
- Pickup without a Stripe shipping option, and the webhook's API-version fields, still need confirmation in the test-mode run.
