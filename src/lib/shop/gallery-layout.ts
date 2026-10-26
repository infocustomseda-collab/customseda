/** Keep the lead photo full-width, then pack each photo into the shortest column. */
export function masonryLayout(images: { width: number; height: number }[], width: number, gap: number) {
	const bottoms = [0, 0];
	const items = images.map((image, index) => {
		const column = bottoms[0] <= bottoms[1] ? 0 : 1;
		const itemWidth = index === 0 ? width : (width - gap) / 2;
		const height = itemWidth * image.height / image.width;
		const top = bottoms[column];
		if (index === 0) bottoms.fill(height + gap);
		else bottoms[column] = top + height + gap;
		return { left: index === 0 ? 0 : column * (itemWidth + gap), top, width: itemWidth, height };
	});
	return { items, height: items.length ? Math.max(...bottoms) - gap : 0 };
}
