// Build-time responsive images. The images step reads each referenced original from the
// environment's R2, writes WebP derivatives to public/media/ and annotates the snapshot's image
// values with them; imageView turns those into srcset. Images without derivatives keep the original URL.
export const IMAGE_WIDTHS = [480, 960, 1440];
const MEDIA_URL = "/_emdash/api/media/file/";

export type Derivative = { width: number; src: string };
export type Generated = { width: number; height: number; derivatives: Derivative[] };
export type ImageRef = { key: string; width?: number; height?: number };

export function derivativeWidths(originalWidth: number): number[] {
	const widths = IMAGE_WIDTHS.filter((width) => width <= originalWidth);
	return widths.length ? widths : [Math.round(originalWidth)];
}

export function derivativeSrc(key: string, width: number) {
	const stem = key.replace(/\.[^./]+$/, "").replace(/^.*[\\/]/, "").replace(/[^\w-]+/g, "-");
	return `/media/${stem}-${width}.webp`;
}

export const srcsetOf = (derivatives: Derivative[]) => derivatives.map((item) => `${item.src} ${item.width}w`).join(", ");

// EmDash image values carry meta.storageKey; portable-text image blocks carry asset.url.
function keyOf(value: Record<string, any>): string | null {
	if (typeof value.meta?.storageKey === "string" && value.meta.storageKey) return value.meta.storageKey;
	if (typeof value.url === "string" && value.url.startsWith(MEDIA_URL)) return decodeURIComponent(value.url.slice(MEDIA_URL.length));
	return null;
}

function walk(value: unknown, visit: (image: Record<string, any>, key: string) => Record<string, any> | void): unknown {
	if (Array.isArray(value)) return value.map((item) => walk(item, visit));
	if (!value || typeof value !== "object") return value;
	const record = value as Record<string, any>;
	const key = keyOf(record);
	if (key) return visit(record, key) ?? record;
	return Object.fromEntries(Object.entries(record).map(([name, child]) => [name, walk(child, visit)]));
}

/** Every distinct media image referenced anywhere in the snapshot, with stored dimensions when known. */
export function collectImages(snapshot: unknown): ImageRef[] {
	const found = new Map<string, ImageRef>();
	walk(snapshot, (image, key) => {
		const known = image.width > 0 && image.height > 0 ? { width: image.width, height: image.height } : {};
		if (!found.has(key) || (known.width && !found.get(key)!.width)) found.set(key, { key, ...known });
	});
	return [...found.values()];
}

/** Reuse prepared files in live local previews, matching immutable R2 storage keys. */
export function generatedImages(snapshot: unknown): Map<string, Generated> {
	const generated = new Map<string, Generated>();
	walk(snapshot, (image, key) => {
		if (image.width > 0 && image.height > 0 && Array.isArray(image.derivatives) && image.derivatives.length) {
			generated.set(key, { width: image.width, height: image.height, derivatives: image.derivatives });
		}
	});
	return generated;
}

/** A copy of the snapshot whose image values list their derivatives (and measured size when missing). */
export function annotateImages<T>(snapshot: T, generated: Map<string, Generated>): T {
	return walk(snapshot, (image, key) => {
		const result = generated.get(key);
		if (!result?.derivatives.length) return;
		return { ...image, width: image.width ?? result.width, height: image.height ?? result.height, derivatives: result.derivatives };
	}) as T;
}
