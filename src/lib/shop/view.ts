// Presentational view models shared by the public shop components. Pages map CMS data
// (live in development, the build-time snapshot in phase 6) into these shapes.

export type GalleryImage = {
	id: string;
	src: string;
	alt: string;
	width: number;
	height: number;
	/** CSS object-position derived from the optional 0–1 focal point. */
	position: string;
	/** Dominant color shown while the photo loads. */
	placeholder?: string;
};

export type ProductCardView = {
	href: string;
	title: string;
	priceCents: number;
	images: GalleryImage[];
	available: boolean;
	/** Stable name used later for product-to-detail view transitions. */
	transitionName?: string;
};

export type NavItem = { label: string; href: string; current?: boolean };
export type SocialLink = { network: "instagram" | "tiktok"; href: string };

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;
export type SizeCode = (typeof SIZE_ORDER)[number];

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatPrice(cents: number): string {
	if (typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0) {
		throw new TypeError("Price must be a nonnegative integer number of cents.");
	}
	return euros.format(cents / 100);
}

const SAFE_COLOR = /^(#[\da-f]{3,8}|rgb\(\d{1,3},\s?\d{1,3},\s?\d{1,3}\))$/i;
const percent = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : "50%";

export function galleryImages(gallery: unknown): GalleryImage[] {
	if (!Array.isArray(gallery)) return [];
	return gallery.flatMap((row) => {
		const image = row?.image;
		const key = image?.meta?.storageKey;
		if (!image || typeof key !== "string" || !key || !(image.width > 0) || !(image.height > 0)) return [];
		const color = image.dominantColor ?? image.meta?.dominantColor;
		return [{
			id: String(image.id),
			src: `/_emdash/api/media/file/${encodeURIComponent(key)}`,
			alt: typeof row.alt === "string" ? row.alt : "",
			width: image.width,
			height: image.height,
			position: `${percent(row.focal_x)} ${percent(row.focal_y)}`,
			...(typeof color === "string" && SAFE_COLOR.test(color) ? { placeholder: color } : {}),
		}];
	});
}

export function orderSizes(codes: readonly string[] | undefined): SizeCode[] {
	const wanted = new Set((codes ?? []).map((code) => code.toUpperCase()));
	return SIZE_ORDER.filter((code) => wanted.has(code));
}
