// Minimal payment-event records for Stripe webhooks. Stripe Dashboard stays the order system; this
// table only deduplicates events and keeps payment state, without customer names, emails or addresses.
import { OptionsRepository, type Database } from "emdash";
import { sql, type Kysely } from "kysely";
import { SESSION_SOURCE } from "./checkout.ts";
import { addressCheck } from "./shipping.ts";
import type { StripeEvent } from "./stripe.ts";

export const checkoutVersion = "customseda.checkout.v1";

export async function applyCheckoutModel(db: Kysely<Database>) {
	const options = new OptionsRepository(db);
	if (await options.get(checkoutVersion)) return { version: checkoutVersion, applied: false };
	await sql`CREATE TABLE IF NOT EXISTS customseda_payment_events (
		event_id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		session_id TEXT,
		payment_intent_id TEXT,
		status TEXT NOT NULL,
		address_check TEXT,
		livemode INTEGER NOT NULL,
		stripe_created INTEGER NOT NULL,
		received_at TEXT NOT NULL
	)`.execute(db);
	await sql`CREATE INDEX IF NOT EXISTS customseda_payment_events_session ON customseda_payment_events (session_id)`.execute(db);
	await options.set(checkoutVersion, { appliedAt: new Date().toISOString() });
	return { version: checkoutVersion, applied: true };
}

const STATUS: Record<string, (session: Record<string, any>) => string> = {
	"checkout.session.completed": (session) => (session.payment_status === "paid" ? "paid" : "pending"),
	"checkout.session.async_payment_succeeded": () => "paid",
	"checkout.session.async_payment_failed": () => "failed",
	"checkout.session.expired": () => "expired",
};

export type FlagPaymentIntent = (paymentIntentId: string, ruleId: string, postalCode: string) => Promise<void>;

/**
 * Records a Checkout Session event once. Side effects run before the insert, so a failure returns
 * an error, nothing is recorded, and Stripe's retry repeats the (idempotent) side effect.
 */
export async function handleStripeEvent(db: Kysely<Database>, event: StripeEvent, { flagPaymentIntent }: { flagPaymentIntent: FlagPaymentIntent }) {
	const status = STATUS[event.type];
	const session = event.data.object;
	const metadata = (session.metadata ?? {}) as Record<string, string>;
	// Payment Links or Dashboard checkouts in the same account are not this site's orders.
	if (!status || metadata.source !== SESSION_SOURCE) return "ignored";
	const existing = await sql`SELECT 1 FROM customseda_payment_events WHERE event_id = ${event.id}`.execute(db);
	if (existing.rows.length) return "duplicate";

	let check: string | null = null;
	if (event.type === "checkout.session.completed") {
		const split = (value?: string) => (value ? value.split(",").filter(Boolean) : []);
		// Newer API versions move shipping details under collected_information.
		const address = (session.collected_information?.shipping_details ?? session.shipping_details)?.address;
		check = addressCheck({ zone: metadata.shipping_zone ?? "", countries: split(metadata.shipping_countries), postalPrefixes: split(metadata.shipping_postal_prefixes) }, address);
		if (check === "revisar" && session.payment_intent) await flagPaymentIntent(session.payment_intent, metadata.shipping_rule_id ?? "", address?.postal_code ?? "");
	}
	await sql`INSERT OR IGNORE INTO customseda_payment_events
		(event_id, type, session_id, payment_intent_id, status, address_check, livemode, stripe_created, received_at)
		VALUES (${event.id}, ${event.type}, ${session.id ?? null}, ${session.payment_intent ?? null}, ${status(session)}, ${check},
			${event.livemode ? 1 : 0}, ${event.created}, ${new Date().toISOString()})`.execute(db);
	return "recorded";
}
