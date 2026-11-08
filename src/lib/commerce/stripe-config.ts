export type StripeSecrets = { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string };
export type StripeBindings = StripeSecrets & { SITE_ROLE?: string; CMS_ORIGIN?: string };

/** Preview/local runtimes never charge real money, even if a live key is supplied by mistake. */
export function stripeMode(bindings: StripeBindings): "test" | "live" {
	return bindings.SITE_ROLE === "public" && !bindings.CMS_ORIGIN ? "live" : "test";
}

/** Return no configuration on mismatch, so checkout and webhooks fail before calling Stripe. */
export function configuredStripeSecrets(bindings: StripeBindings): StripeSecrets {
	const mode = stripeMode(bindings);
	const secretKey = bindings.STRIPE_SECRET_KEY;
	if (!secretKey || !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(secretKey)) return {};
	return {
		STRIPE_SECRET_KEY: secretKey,
		STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9]+$/.test(bindings.STRIPE_WEBHOOK_SECRET ?? "") ? bindings.STRIPE_WEBHOOK_SECRET : undefined,
	};
}

/** A valid signature alone must not let events cross the test/live boundary. */
export function stripeEventMatchesMode(bindings: StripeBindings, event: { livemode: boolean }): boolean {
	return event.livemode === (stripeMode(bindings) === "live");
}
