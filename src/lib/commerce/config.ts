// Stripe secrets are Worker secret bindings (.env locally, `wrangler secret put` remotely).
import { env } from "cloudflare:workers";
import { configuredStripeSecrets, type StripeBindings } from "./stripe-config";

export type { StripeSecrets } from "./stripe-config";
export const stripeSecrets = () => configuredStripeSecrets(env as unknown as StripeBindings);
