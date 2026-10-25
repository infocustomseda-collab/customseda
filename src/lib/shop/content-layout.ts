// Splits a content page's rich text into the pieces ContentPage lays out: an optional leading
// photo beside the text, the text itself, photos after the text, and an index of its sections.

type Span = { text?: string };
export type ContentBlock = { _type: string; _key?: string; style?: string; children?: Span[]; _anchor?: string; [key: string]: unknown };
export type TocItem = { id: string; text: string; children?: { id: string; text: string }[] };
export type ContentLayout = { heading: string; lead?: ContentBlock; body: ContentBlock[]; trailing: ContentBlock[]; toc: TocItem[] };

/** Pages with fewer section headings than this read fine without an index. */
const TOC_MIN_HEADINGS = 4;

const textOf = (block: ContentBlock) => (block.children ?? []).map((span) => span.text ?? "").join("").trim();
const isImage = (block: ContentBlock) => block._type === "image";
const isHeading = (block: ContentBlock) => block._type === "block" && (block.style === "h2" || block.style === "h3");

function anchorOf(text: string, used: Set<string>): string {
	const base = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "seccion";
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
	used.add(id);
	return id;
}

/**
 * `headingFromContent` promotes the first h2 to the page heading (the live "Sobre Seda" page shows
 * "HOLA! SOY PAULA SEDA" as its title). Photos inside the text stay where the editor put them.
 */
export function contentLayout(value: unknown, options: { heading: string; headingFromContent?: boolean }): ContentLayout {
	let blocks = (Array.isArray(value) ? value : []) as ContentBlock[];
	// A page that is only photos (the size guide) has no text to sit beside: keep them in the column.
	if (!blocks.some((block) => !isImage(block))) return { heading: options.heading, body: blocks, trailing: [], toc: [] };
	const lead = blocks[0] && isImage(blocks[0]) ? blocks[0] : undefined;
	if (lead) blocks = blocks.slice(1);

	let heading = options.heading;
	const first = blocks.find((block) => !isImage(block));
	if (options.headingFromContent && first?.style === "h2" && textOf(first)) {
		heading = textOf(first);
		blocks = blocks.filter((block) => block !== first);
	}

	let end = blocks.length;
	while (end > 0 && isImage(blocks[end - 1])) end--;
	const trailing = blocks.slice(end);

	const used = new Set<string>();
	const body = blocks.slice(0, end).map((block) => (isHeading(block) && textOf(block) ? { ...block, _anchor: anchorOf(textOf(block), used) } : block));

	const sections = body.filter((block) => block._anchor);
	const toc: TocItem[] = [];
	if (sections.length >= TOC_MIN_HEADINGS) {
		for (const block of sections) {
			const item = { id: block._anchor!, text: textOf(block) };
			const parent = toc.at(-1);
			if (block.style === "h3" && parent?.children) parent.children.push(item);
			else toc.push(block.style === "h2" ? { ...item, children: [] } : item);
		}
	}
	return { heading, lead, body, trailing, toc };
}
