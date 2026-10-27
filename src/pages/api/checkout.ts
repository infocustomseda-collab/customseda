// Buy-now form target: validates the item against the database and redirects to Stripe Checkout,
// or back to the product page with a reason (?checkout=<code>) before any payment.
import type { APIRoute } from "astro";
import { getDb } from "emdash/runtime";
import { QUOTE_TYPES, parseOrder, quoteOrder, sessionParams, type CheckoutError } from "../../lib/commerce/checkout";
import { stripeSecrets } from "../../lib/commerce/config";
import { stripeRequest } from "../../lib/commerce/stripe";
import { loadShop } from "../../lib/shop/content";

export const prerender = false;

export const POST: APIRoute = async ({ request, url, redirect }) => {
	const form = await request.formData().catch(() => null);
	const slug = form?.get("slug");
	const product = typeof slug === "string" && /^[\w-]+$/.test(slug) ? `/products/${slug}` : "/collections/bikinis";
	const back = (error: CheckoutError) => redirect(`${product}?checkout=${error}#comprar`, 303);

	const order = form && parseOrder(form);
	if (!order) return back("invalid");
	const secretKey = stripeSecrets().STRIPE_SECRET_KEY;
	if (!secretKey) return back("config");
	// Same content mode as the pages: local drafts in development, published entries when deployed.
	const shop = await loadShop(await getDb(), {
		drafts: import.meta.env.DEV,
		only: [...QUOTE_TYPES],
	});
	const quote = quoteOrder(shop, order);
	if (!quote.ok) return back(quote.error);
	try {
		const session = await stripeRequest<{ url: string }>({ secretKey }, "POST", "/v1/checkout/sessions", sessionParams(quote, url.origin));
		return redirect(session.url, 303);
	} catch (error) {
		console.error("Stripe Checkout Session creation failed", error);
		return back("stripe");
	}
};
