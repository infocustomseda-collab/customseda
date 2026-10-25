// Popup scheduling and dismissal, decided in the browser because public pages are prerendered.
// Client-safe: no server imports.

export type PopupSchedule = { id: string; startsAt: string | null; endsAt: string | null; dismissDays: number };

const DAY = 86_400_000;
const time = (value: string | null) => (value ? Date.parse(value) : Number.NaN);

export const popupStorageKey = (id: string) => `seda:popup:${id}:dismissed`;

/** Inside the start/end window (unparseable bounds are ignored) and not dismissed within dismissDays. */
export function shouldShowPopup(schedule: PopupSchedule, now: number, dismissedAt: number | null): boolean {
	const start = time(schedule.startsAt);
	const end = time(schedule.endsAt);
	if (!Number.isNaN(start) && now < start) return false;
	if (!Number.isNaN(end) && now > end) return false;
	return dismissedAt === null || now - dismissedAt >= schedule.dismissDays * DAY;
}
