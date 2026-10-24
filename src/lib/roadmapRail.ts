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

/**
 * Sticky offset of the table heads — directly under the frozen app header and,
 * where the pane has one, under the sticky toolbar above the table.
 *
 * Both heights are published as CSS variables at runtime (AppHeader.vue
 * measures the header into --app-header-h, TopicTable.vue measures its toolbar
 * into --dict-toolbar-h) because neither is a fixed number: the header follows
 * the fluid wordmark, and the toolbar wraps to two rows on narrow screens. A
 * hard-coded offset left a strip between the header and the head for rows to
 * scroll through. Panes without a toolbar inherit the 0px fallback and pin
 * straight under the header.
 */
export const THEAD_STICKY_TOP = 'top-[calc(var(--app-header-h)+var(--dict-toolbar-h,0px))]'
