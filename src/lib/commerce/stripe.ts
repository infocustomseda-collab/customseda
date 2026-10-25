// Minimal Stripe REST client for Workers: form-encoded requests over fetch and webhook signature
// verification with Web Crypto. Keeps the Worker bundle small; see docs/checkout.md.
export type StripeConfig = { secretKey: string; fetch?: typeof fetch };

/** Stripe's form encoding: nested objects and arrays become bracketed keys; undefined is omitted. */
export function formEncode(params: Record<string, unknown>): string {
	const pairs: [string, string][] = [];
	const add = (key: string, value: unknown) => {
		if (value === undefined || value === null) return;
		if (Array.isArray(value)) value.forEach((item, index) => add(`${key}[${index}]`, item));
		else if (typeof value === "object") for (const [child, item] of Object.entries(value)) add(`${key}[${child}]`, item);
		else pairs.push([key, String(value)]);
	};
	for (const [key, value] of Object.entries(params)) add(key, value);
	return new URLSearchParams(pairs).toString();
}

export async function stripeRequest<T = Record<string, any>>(config: StripeConfig, method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
	const response = await (config.fetch ?? fetch)(`https://api.stripe.com${path}`, {
		method,
		headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
		body: params ? formEncode(params) : undefined,
	});
	const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
	if (!response.ok) throw new Error(`Stripe ${response.status}: ${body.error?.message ?? "request failed"}`);
	return body as T;
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const equal = (a: string, b: string) => {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
	return difference === 0;
};

export type StripeEvent = { id: string; type: string; created: number; livemode: boolean; data: { object: Record<string, any> } };

/** Verifies a `Stripe-Signature` header (HMAC-SHA256 of "<t>.<payload>") and returns the parsed event. */
export async function verifyWebhook(payload: string, header: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<StripeEvent> {
	const parts = header.split(",").map((part) => part.trim().split("="));
	const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
	const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
	if (!Number.isFinite(timestamp) || !signatures.length) throw new Error("Invalid Stripe signature header.");
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
	if (!signatures.some((signature) => equal(signature, expected))) throw new Error("Stripe signature mismatch.");
	if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) throw new Error("Stripe signature outside the tolerance window.");
	return JSON.parse(payload) as StripeEvent;
}
