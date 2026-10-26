// Direction of the page slide between two paths, ordered like the header menu.

export type Slide = "forward" | "back" | "morph" | "none";

export const normalizePath = (pathname: string) => pathname.replace(/\/$/, "") || "/";

/** Product and Conjunto pages crossfade so the card photo and title can fly into place. */
export const isDetailPage = (path: string) => /^\/products\/[^/]+$/.test(path);

/** The menu item a path belongs to, matched like the header's current item ("/" only on itself). */
export function menuIndex(menu: readonly string[], path: string): number {
	let best = -1;
	menu.forEach((href, index) => {
		const inside = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
		if (inside && (best === -1 || href.length > menu[best].length)) best = index;
	});
	return best;
}

/**
 * Moving to a menu item further right brings the new page in from the right, moving left brings
 * it in from the left. Pages outside the menu enter from the right, or from the left on browser
 * Back; without a visible menu (small screens) every page enters from the right.
 */
export function slideFor(
	menu: readonly string[],
	from: string,
	to: string,
	{ historyBack = false, menuVisible = true } = {},
): Slide {
	if (from === to) return "none";
	if (isDetailPage(from) || isDetailPage(to)) return "morph";
	if (!menuVisible) return "forward";
	const fromIndex = menuIndex(menu, from);
	const toIndex = menuIndex(menu, to);
	if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) return toIndex > fromIndex ? "forward" : "back";
	return historyBack ? "back" : "forward";
}
