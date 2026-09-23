// RoadmapSidePane — the chapter rail's shell, shared by every roadmap layout
// (Dictionary · Lectures · Stories). The height rule lives HERE and nowhere
// else: the rail is a self-sized panel — self-start cancels the grid's default
// align-items:stretch, so its height is its own content capped at the viewport,
// NEVER the height of the content pane. The chapter list scrolls inside the
// rail (its own scrollbar, overscroll-contained); the page content keeps the
// browser scroll. Tokens come from src/lib/roadmapRail.ts.
<script setup lang="ts">
import { RAIL_STICKY_TOP, RAIL_MAX_HEIGHT } from '~/lib/roadmapRail'
</script>

<template>
  <div class="min-w-0 self-start lg:sticky lg:flex lg:flex-col" :class="[RAIL_STICKY_TOP, RAIL_MAX_HEIGHT]">
    <slot name="label" />
    <!-- The rail's own scroll container — engaged only when the list outgrows the cap -->
    <div class="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
      <slot />
    </div>
  </div>
</template>