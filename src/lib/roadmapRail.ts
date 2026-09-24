/**
 * roadmapRail — the shared layout tokens for the roadmap chapter rail.
 *
 * THE RULE (enforced by RoadmapSidePane.vue — never re-declare it by hand):
 * the rail is EXACTLY as tall as the page content — never shorter, never
 * taller. The RoadmapShell grid stretches the rail cell to the content
 * column's height; the rail panel is absolutely positioned inside that cell,
 * so its own list never drives the row height. A chapter list longer than
 * the content scrolls inside the rail (its own scrollbar); the page content
 * keeps the browser scroll between the frozen header and footer.
 */

/** Sticky offset of the table heads — just under the frozen header
 *  (the header wraps to 2 rows below md). */
export const THEAD_STICKY_TOP = 'top-[7rem] md:top-14'
