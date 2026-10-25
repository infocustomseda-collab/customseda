// Stripe webhook: verifies the signature, then records Checkout Session payment events once.
import type { APIRoute } from "astro";
import { getDb } from "emdash/runtime";
import { stripeSecrets } from "../../../lib/commerce/config";
import { handleStripeEvent } from "../../../lib/commerce/payments";
import { stripeRequest, verifyWebhook } from "../../../lib/commerce/stripe";

export const prerender = false;

const REVIEW = "REVISAR DIRECCIÓN · ";

export const POST: APIRoute = async ({ request }) => {
	const { STRIPE_SECRET_KEY: secretKey, STRIPE_WEBHOOK_SECRET: webhookSecret } = stripeSecrets();
	if (!secretKey || !webhookSecret) return new Response("Stripe is not configured.", { status: 503 });
	let event;
	try {
		event = await verifyWebhook(await request.text(), request.headers.get("stripe-signature") ?? "", webhookSecret);
	} catch {
		return new Response("Invalid signature.", { status: 400 });
	}
	const result = await handleStripeEvent(await getDb(), event, {
		// Visible in the Dashboard payments list: the address does not match the chosen shipping zone.
		async flagPaymentIntent(id, ruleId, postalCode) {
			const intent = await stripeRequest<{ description?: string | null }>({ secretKey }, "GET", `/v1/payment_intents/${encodeURIComponent(id)}`);
			const description = intent.description ?? "";
			await stripeRequest({ secretKey }, "POST", `/v1/payment_intents/${encodeURIComponent(id)}`, {
				description: description.startsWith(REVIEW) ? description : `${REVIEW}${description}`.slice(0, 1000),
				metadata: { address_check: "revisar", address_postal_code: postalCode, address_rule_id: ruleId },
			});
		},
	});
	return Response.json({ received: true, result });
};
