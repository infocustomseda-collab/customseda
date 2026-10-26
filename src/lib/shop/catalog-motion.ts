// FLIP layout animation: outgoing cards leave first, survivors retain their identity
// while moving into the new grid, and returning cards fade into their places.
type Position = { left: number; top: number };
type Timing = { exit: number; move: number; enter: number; easing: string };

export class CatalogGridMotion {
	private animations = new Set<Animation>();
	private revision = 0;

	private grid: HTMLElement;
	private cards: Map<string, HTMLElement>;
	private timing: Timing;

	constructor(grid: HTMLElement, cards: Map<string, HTMLElement>, timing: Timing) {
		this.grid = grid;
		this.cards = cards;
		this.timing = timing;
	}

	cancel() {
		this.revision++;
		for (const animation of this.animations) animation.cancel();
		this.animations.clear();
	}

	private play(card: HTMLElement, frames: Keyframe[], duration: number) {
		const animation = card.animate(frames, { duration, easing: this.timing.easing, fill: "both" });
		this.animations.add(animation);
		// Cancel also removes the fill effect, so no transform/opacity survives the run.
		animation.finished.then(() => {
			animation.cancel();
			this.animations.delete(animation);
		}, () => this.animations.delete(animation));
		return animation;
	}

	update(ids: string[], animate: boolean) {
		// Read current visual positions before cancelling an interrupted move.
		const before = new Map<string, Position>();
		for (const [id, card] of this.cards) if (!card.hidden) before.set(id, card.getBoundingClientRect());
		const interrupted = this.animations.size > 0;
		this.cancel();
		const revision = this.revision;
		const wanted = new Set(ids);
		const commit = () => {
			if (revision !== this.revision) return;
			for (const id of ids) this.grid.appendChild(this.cards.get(id)!);
			for (const [id, card] of this.cards) card.hidden = !wanted.has(id);
			if (!animate) return;
			// Batch all layout reads before starting any animations.
			const after = new Map(ids.map(id => [id, this.cards.get(id)!.getBoundingClientRect()]));
			for (const id of ids) {
				const card = this.cards.get(id)!;
				const start = before.get(id);
				const end = after.get(id)!;
				if (!start) {
					this.play(card, [{ opacity: 0 }, { opacity: 1 }], this.timing.enter);
				} else {
					const x = start.left - end.left, y = start.top - end.top;
					if (x || y) this.play(card, [
						{ transform: `translate(${x}px, ${y}px)` },
						{ transform: "translate(0px, 0px)" },
					], this.timing.move);
				}
			}
		};
		const exiting = [...before.keys()].filter(id => !wanted.has(id));
		if (!animate || interrupted || exiting.length === 0) {
			commit();
			return;
		}
		const exits = exiting.map(id => this.play(this.cards.get(id)!, [
			{ opacity: 1 }, { opacity: 0 },
		], this.timing.exit));
		Promise.allSettled(exits.map(animation => animation.finished)).then(commit);
	}
}
