// Buy-now checkout: one product or Conjunto per Stripe Checkout Session. Prices, availability and
// sizes come from the database, never from the form; the form's price only detects a stale page.
import { buildCatalog } from "../shop/catalog.ts";
import type { ShopContent } from "../shop/content.ts";
import { shippingCost, shippingRules, type ShippingRule } from "./shipping.ts";

export const MAX_QUANTITY = 10;
export const MIN_PRICE_CENTS = 50;
/** Marks sessions this site created; the webhook ignores others in the same Stripe account. */
export const SESSION_SOURCE = "customseda";
export type Order = {
 id: string;
 sizes: Record<string, string | null>;
 quantity: number;
 shipping: string;
 price: number;
};

const text = (form: FormData, key: string) => {
	const value = form.get(key);
	return typeof value === "string" && value.trim() ? value.trim() : null;
};
const integer = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : null);

export function parseOrder(form: FormData): Order | null {
	const id = text(form, "id");
	const shipping = text(form, "shipping");
	const quantity = integer(text(form, "quantity"));
	const price = integer(text(form, "price"));
	if (!id || !shipping || price === null || quantity === null || quantity < 1 || quantity > MAX_QUANTITY) return null;
	const sizes = Object.fromEntries([...form.keys()].filter(field=>field === "talla" || field.startsWith("size_")).map(field=>[field,text(form,field)]));
	return { id, sizes, quantity, shipping, price };
}

export type CheckoutError = "invalid" | "unavailable" | "size" | "price" | "shipping" | "config" | "stripe";
export type Component = { role: "pieza" | "component"; id: string; title: string; size: string };
export type Quote =
	| {
			ok: true;
			line: { kind: "pieza" | "bundle"; id: string; slug: string; title: string; detail: string; unitCents: number; quantity: number; subtotalCents: number; components: Component[] };
			shipping: { rule: ShippingRule; cents: number };
			totalCents: number;
	  }
	| { ok: false; error: CheckoutError };

type QuoteShop = Pick<ShopContent, "categories" | "collections" | "colors" | "sizes" | "products" | "shipping_rules">;

export function quoteOrder(shop: QuoteShop, order: Order): Quote {
	const items = buildCatalog(shop);
	const item = items.find((candidate) => candidate.id === order.id);
	// Stripe's minimum charge is 0,50 €; a lower price is a data error, not a free item.
	if (!item || !item.available || item.price < MIN_PRICE_CENTS) return { ok: false, error: "unavailable" };
	const piece = (id: string | undefined) => items.find((candidate) => candidate.id === id && candidate.kind === "pieza");
	const choose = (role: Component["role"], id: string | undefined, size: string | null): Component | null => {
		const found = piece(id);
		return found && size && (found.sizes as readonly string[]).includes(size) ? { role, id: found.id, title: found.title, size } : null;
	};
	let components: (Component | null)[];
	if (item.kind === "bundle") {
		const entry = shop.products.find((product) => product.id === item.id)!;
		components = (entry.refs.components??[]).map(id=>choose("component",id,order.sizes[`size_${id}`]??null));
	} else {
		components = [choose("pieza", item.id, order.sizes.talla??null)];
	}
	if (components.some((component) => !component)) return { ok: false, error: "size" };
	if (order.price !== item.price) return { ok: false, error: "price" };
	const rule = shippingRules(shop).find((candidate) => candidate.id === order.shipping);
	if (!rule) return { ok: false, error: "shipping" };

	const chosen = components as Component[];
	const detail = item.kind === "bundle" ? chosen.map(component=>`${component.title}: ${component.size}`).join(" · ") : `Talla: ${chosen[0].size}`;
	const subtotalCents = item.price * order.quantity;
	const shippingCents = shippingCost(rule, subtotalCents);
	return {
		ok: true,
		line: { kind: item.kind, id: item.id, slug: item.slug, title: item.title, detail, unitCents: item.price, quantity: order.quantity, subtotalCents, components: chosen },
		shipping: { rule, cents: shippingCents },
		totalCents: subtotalCents + shippingCents,
	};
}

// Stripe metadata: at most 50 keys of 40 characters and string values of 500 characters.
const clip = (value: string) => value.slice(0, 500);

/** Snapshot of what was charged, readable in Stripe Dashboard for manual production. */
export function orderMetadata(quote: Extract<Quote, { ok: true }>): Record<string, string> {
	const { line, shipping } = quote;
	const metadata: Record<string, string> = {
		source: SESSION_SOURCE,
		item_kind: line.kind,
		item_id: line.id,
		item_slug: line.slug,
		item_title: line.title,
		quantity: String(line.quantity),
		unit_price_cents: String(line.unitCents),
		subtotal_cents: String(line.subtotalCents),
		shipping_cents: String(shipping.cents),
		total_cents: String(quote.totalCents),
		currency: "eur",
		shipping_rule_id: shipping.rule.id,
		shipping_zone: shipping.rule.zone,
		shipping_title: shipping.rule.title,
		shipping_countries: shipping.rule.countries.join(","),
		shipping_postal_prefixes: shipping.rule.postalPrefixes.join(","),
	};
	// Indexed keys cover ordinary bundles; a compact JSON list preserves every component
	// for larger bundles while respecting Stripe's 50-key / 500-character limits.
	const componentData = line.components.map(({id,title,size})=>({id,title,size}));
	if (line.components.length <= 8) {
		for (const [index,component] of line.components.entries()) {
			const key = component.role === "pieza" ? "piece" : `component_${index+1}`;
			metadata[`${key}_id`]=component.id;
			metadata[`${key}_title`]=component.title;
			metadata[`${key}_size`]=component.size;
		}
	} else {
		const json=JSON.stringify(componentData);
		for(let offset=0;offset<json.length;offset+=500) metadata[`components_${offset/500+1}`]=json.slice(offset,offset+500);
		if(Object.keys(metadata).length>50) throw new Error("Bundle details exceed Stripe metadata capacity.");
	}
	return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, clip(value)]));
}

export function sessionParams(quote: Extract<Quote, { ok: true }>, origin: string) {
	const { line, shipping } = quote;
	const metadata = orderMetadata(quote);
	return {
		mode: "payment",
		locale: "es",
		client_reference_id: line.id,
		line_items: [{ quantity: line.quantity, price_data: { currency: "eur", unit_amount: line.unitCents, product_data: { name: line.title, description: line.detail } } }],
		// Pickup collects no address and has no Stripe shipping option; the description and metadata name it.
		...(shipping.rule.zone === "pickup"
			? {}
			: {
					shipping_options: [{ shipping_rate_data: { type: "fixed_amount", display_name: shipping.rule.title, fixed_amount: { amount: shipping.cents, currency: "eur" } } }],
					shipping_address_collection: { allowed_countries: shipping.rule.countries },
				}),
		// Pickup is arranged by phone, and couriers ask for a contact number.
		phone_number_collection: { enabled: true },
		metadata,
		payment_intent_data: {
			description: clip(`${line.quantity} × ${line.title} (${line.detail}) · Envío: ${shipping.rule.title}`),
			metadata,
		},
		success_url: `${origin}/checkout/gracias?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/checkout/cancelado?producto=${encodeURIComponent(line.slug)}`,
	};
}

/** Selected sizes from both current bundle sessions and previously paid orders. */
export function orderSizeSummary(metadata: Record<string,string>): string {
 if(metadata.item_kind==='conjunto') return `Top: ${metadata.top_size} · Braguita: ${metadata.braguita_size}`;
 if(metadata.item_kind!=='bundle') return metadata.piece_size?`Talla: ${metadata.piece_size}`:'';
 if(metadata.components_1) {
  const keys=Object.keys(metadata).filter(key=>/^components_\d+$/.test(key)).sort((a,b)=>Number(a.split('_')[1])-Number(b.split('_')[1]));
  try {
   const components:unknown=JSON.parse(keys.map(key=>metadata[key]).join(''));
   if(Array.isArray(components)) return components.filter(component=>typeof component?.title==='string'&&typeof component?.size==='string').map(component=>`${component.title}: ${component.size}`).join(' · ');
  } catch {return '';}
 }
 return Object.keys(metadata).filter(key=>/^component_\d+_size$/.test(key)).sort((a,b)=>Number(a.split('_')[1])-Number(b.split('_')[1])).map(key=>`${metadata[key.replace('_size','_title')]}: ${metadata[key]}`).join(' · ');
}
