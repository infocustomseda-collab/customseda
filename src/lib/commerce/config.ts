// Stripe secrets are Worker secret bindings (.env locally, `wrangler secret put` remotely).
import { env } from "cloudflare:workers";

export type StripeSecrets = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string };
export const stripeSecrets = () => env as unknown as StripeSecrets;
