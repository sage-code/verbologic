/**
 * roadmapRail — the shared layout tokens for the roadmap chapter rail.
 *
 * THE RULE (enforced by RoadmapSidePane.vue — never re-declare these by hand):
 * the rail is a SELF-SIZED panel. `self-start` cancels the grid's default
 * align-items:stretch, so the rail's height is its own content capped at the
 * viewport — never the height of the content pane. The chapter list scrolls
 * INSIDE the rail; the page content keeps the browser scroll.
 *
 * The rail's sticky offset must equal the table head's (`THEAD_STICKY_TOP`),
 * so the rail top and the sticky table header line up at every breakpoint.
 * The rail is only sticky in the two-column layout (lg), where the md: offset
 * applies — hence `lg:top-14`.
 */

/** Sticky offset of the dictionary table heads (mobile header wraps to 2 rows). */
export const THEAD_STICKY_TOP = 'top-[7rem] md:top-14'

/** Sticky offset of the rail in the two-column layout (== the thead's md offset). */
export const RAIL_STICKY_TOP = 'lg:top-14'

/** Rail height cap: viewport minus the sticky offset, minus a breathing gap. */
export const RAIL_MAX_HEIGHT = 'lg:max-h-[calc(100dvh-5rem)]'
