// Shipping from the CMS Shipping Rules. The buyer picks a rule before Stripe Checkout, which then
// collects an address in the rule's countries. Hosted Checkout cannot restrict postal codes, so the
// webhook compares the address against the rule and flags mismatches for the merchant.
import type { ShopContent } from "../shop/content.ts";

export type ShippingRule = {
	id: string;
	title: string;
	zone: string;
	countries: string[];
	postalPrefixes: string[];
	priceCents: number;
	freeAboveCents: number | null;
	description: string;
};

const list = (value: unknown) =>
	typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : [];
const cents = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

const ZONES = ["canarias", "peninsula_baleares", "international", "pickup"];
const SPANISH_ZONES = ["canarias", "peninsula_baleares"];

/** Enabled, well-formed rules in zone order: pickup needs no country, other zones at least one. */
export function shippingRules(shop: Pick<ShopContent, "shipping_rules">): ShippingRule[] {
	const rules = shop.shipping_rules.flatMap((entry): ShippingRule[] => {
		const { data } = entry;
		const zone = String(data.zone ?? "");
		const price = cents(data.price_cents);
		const countries = list(data.country_codes).map((code) => code.toUpperCase());
		const prefixes = list(data.postal_prefixes);
		if (data.enabled !== true || price === null || !zone) return [];
		// A malformed code would make Stripe reject every session; Spanish zones need prefixes for the address check.
		if (zone !== "pickup" && (!countries.length || !countries.every((code) => /^[A-Z]{2}$/.test(code)))) return [];
		if (!prefixes.every((prefix) => /^\d+$/.test(prefix)) || (SPANISH_ZONES.includes(zone) && !prefixes.length)) return [];
		return [{
			id: entry.id,
			title: String(data.title ?? zone),
			zone,
			countries: zone === "pickup" ? [] : countries,
			postalPrefixes: prefixes,
			priceCents: price,
			freeAboveCents: cents(data.free_above_cents),
			description: typeof data.description === "string" ? data.description : "",
		}];
	});
	return rules.sort((a, b) => ZONES.indexOf(a.zone) - ZONES.indexOf(b.zone) || a.title.localeCompare(b.title, "es"));
}

export const shippingCost = (rule: ShippingRule, subtotalCents: number) =>
	rule.freeAboveCents !== null && subtotalCents >= rule.freeAboveCents ? 0 : rule.priceCents;

export type Address = { country?: string | null; postal_code?: string | null } | null | undefined;

/** "ok" when the delivery address fits the chosen rule, "revisar" when the merchant must check it. */
export function addressCheck(rule: Pick<ShippingRule, "zone" | "countries" | "postalPrefixes">, address: Address) {
	if (rule.zone === "pickup") return "recogida";
	const country = address?.country?.toUpperCase() ?? "";
	const postal = address?.postal_code?.replace(/\s/g, "") ?? "";
	if (!rule.countries.includes(country)) return "revisar";
	if (rule.postalPrefixes.length && !rule.postalPrefixes.some((prefix) => postal.startsWith(prefix))) return "revisar";
	return "ok";
}
