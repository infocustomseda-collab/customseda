// Pure mappings from CMS entries and menus to the presentational view models.
import type { SiteChrome } from "../../layouts/Shop.astro";
import type { ShopContent, ShopEntry } from "./content.ts";
import type { PopupSchedule } from "./popup.ts";
import { galleryImages, imageView, type NavItem, type ProductCardView, type SocialLink } from "./view.ts";
import { menuIndex, normalizePath } from "./slide.ts";

type Menu = { items: { label: string; url: string }[] } | null | undefined;

const OLD_HOSTS = new Set(["customseda.com", "www.customseda.com"]);

/** Keeps site paths and external http(s) links; rewrites links to the storefront domain to paths. */
export function localHref(value: unknown): string | undefined {
	if (typeof value !== "string" || !value) return undefined;
	if (value.startsWith("/") && !value.startsWith("//")) return value;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
		return OLD_HOSTS.has(url.hostname) ? `${url.pathname}${url.search}${url.hash}` : url.href;
	} catch {
		return undefined;
	}
}

// Rich-text links may also open mail or the phone; navigation and images stay on localHref.
export function linkHref(value: unknown): string | undefined {
	if (typeof value === "string" && /^(mailto|tel):[^\s]+$/i.test(value)) return value;
	return localHref(value);
}

// Astro's file-format prerender supplies /index.html and /pages/<slug>.html.
const navigationPath = (path: string) => normalizePath(path.split(/[?#]/)[0].replace(/^\/index\.html$/, "/").replace(/\.html$/, ""));
const navItems = (menu: Menu, path: string): NavItem[] => {
	const items = (menu?.items ?? []).flatMap((item) => {
		const href = localHref(item.url);
		return href ? [{ label: item.label, href }] : [];
	});
	const paths = items.map(({ href }) => navigationPath(href));
	const current = menuIndex(paths, navigationPath(path));
	return items.map((item, index) => ({ ...item, current: index === current }));
};

export const settingsOf = (shop: Pick<ShopContent, "site_settings">): ShopEntry | undefined => shop.site_settings[0];

export function siteChrome({ settings, primary, footer, path }: { settings: ShopEntry | undefined; primary: Menu; footer: Menu; path: string }): SiteChrome {
	const data = settings?.data ?? {};
	const social: SocialLink[] = [];
	const instagram = localHref(data.instagram_url);
	const tiktok = localHref(data.tiktok_url);
	if (instagram) social.push({ network: "instagram", href: instagram });
	if (tiktok) social.push({ network: "tiktok", href: tiktok });
	const text = typeof data.announcement_text === "string" ? data.announcement_text.trim() : "";
	return {
		siteName: "Seda",
		nav: navItems(primary, path),
		footerLinks: navItems(footer, path),
		social,
		announcement: data.announcement_enabled === true && text ? { text, href: localHref(data.announcement_url) } : null,
	};
}

/** Products and Conjuntos keep their public paths (/products/<slug>). */
export function productCard(entry: ShopEntry): ProductCardView {
	return {
		href: `/products/${entry.slug}`,
		title: String(entry.data.title ?? ""),
		priceCents: Number(entry.data.price_cents ?? 0),
		images: galleryImages(entry.data.gallery),
		available: entry.data.available !== false,
		transitionName: `product-${entry.id}`,
	};
}

/** Plain-text summary of Portable Text paragraphs (headings and media skipped), for meta descriptions. */
export function plainText(value: unknown, max = 160): string {
	if (!Array.isArray(value)) return "";
	const text = value
		.filter((block) => block?._type === "block" && (block.style ?? "normal") === "normal")
		.map((block) => (block.children ?? []).map((child: { text?: string }) => child.text ?? "").join(""))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Content pages use their menu label as heading when a menu links to them (e.g. "Sobre Seda"). */
export function pageHeading(site: Pick<SiteChrome, "nav" | "footerLinks">, path: string, title: string): string {
	return [...site.nav, ...site.footerLinks].find((item) => item.href === path)?.label ?? title;
}

const normalized = (text: string) => text.trim().toLocaleLowerCase("es");
/** Imported pages repeat their title as the first paragraph; the template already renders it. */
export function withoutLeadingTitle(value: unknown, title: string): unknown[] {
	if (!Array.isArray(value)) return [];
	const [first, ...rest] = value;
	const text = first?._type === "block" ? (first.children ?? []).map((child: { text?: string }) => child.text ?? "").join("") : null;
	return text !== null && normalized(text) === normalized(title) ? rest : value;
}

export type PopupView = {
	id: string;
	title: string;
	content: unknown;
	image: ReturnType<typeof imageView>;
	button: { label: string; href: string } | null;
	delaySeconds: number;
	schedule: PopupSchedule;
};

const whole = (value: unknown, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback);
const date = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Every enabled popup that has not ended at render time. Start times are checked in the browser,
 * so a popup scheduled for later never hides one that is running (pages are prerendered). */
export function popupViews(popups: ShopEntry[], now: number): PopupView[] {
	return popups.flatMap((entry) => {
		const end = date(entry.data.ends_at);
		return entry.data.enabled === true && !(end && Date.parse(end) < now) ? [toPopupView(entry)] : [];
	});
}

function toPopupView(entry: ShopEntry): PopupView {
	const label = typeof entry.data.button_text === "string" ? entry.data.button_text.trim() : "";
	const href = localHref(entry.data.button_url);
	return {
		id: entry.id,
		title: String(entry.data.title ?? ""),
		content: entry.data.content,
		image: imageView(entry.data.image, ""),
		button: label && href ? { label, href } : null,
		delaySeconds: whole(entry.data.delay_seconds, 3),
		schedule: { id: entry.id, startsAt: date(entry.data.starts_at), endsAt: date(entry.data.ends_at), dismissDays: whole(entry.data.dismiss_days, 7) },
	};
}

/** "@name" from the last path segment of a social link (absolute or relative); null when there is none. */
export function socialHandle(href: string): string | null {
	const segment = new URL(href, "https://example.invalid").pathname.split("/").filter(Boolean).at(-1);
	return segment ? `@${segment.replace(/^@/, "")}` : null;
}
