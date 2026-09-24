// RoadmapSidePane — the chapter rail's shell, shared by every roadmap layout
// (Dictionary · Lectures · Stories). The height rule lives HERE and nowhere
// else: the rail is EXACTLY as tall as the page content — never shorter, never
// taller. The outer cell is stretched by the RoadmapShell grid (default
// align-items: stretch); the inner panel is absolutely positioned inside it,
// so the rail's own list never drives the row height — the content column
// does. A chapter list longer than the content scrolls inside the rail (its
// own scrollbar, overscroll-contained). Below lg the rail stacks above the
// content at its natural height.
<template>
  <div class="relative min-w-0">
    <div class="lg:absolute lg:inset-0 lg:flex lg:flex-col">
      <slot name="label" />
      <!-- The rail's own scroll container -->
      <div class="lg:min-h-0 lg:flex-1 lg:overflow-y-scroll lg:overscroll-contain">
        <slot />
      </div>
    </div>
  </div>
</template>
