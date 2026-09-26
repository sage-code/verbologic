// https://content.nuxtjs.org/docs/getting-started/configuration
export default defineNuxtConfig({
  content: {
    collections: {
      dictionary: {
        source: 'content/{locale}/dictionary/*.{md,mdx}',
        alias: ['dictionary'],
      },
      lectures: {
        source: 'content/{locale}/lectures/*.{md,mdx}',
        alias: ['lectures'],
      },
      stories: {
        source: 'content/{locale}/stories/*.{md,mdx}',
        alias: ['stories'],
      },
    },
    schema: {
      dictionary: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          article: { type: 'boolean', default: false }, // is this a prose article?
          published: { type: 'boolean', default: true },
        },
      },
      lectures: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          published: { type: 'boolean', default: true },
        },
      },
      stories: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          published: { type: 'boolean', default: true },
        },
      },
    },
  },
});
// https://content.nuxtjs.org/docs/getting-started/configuration
}
export default defineNuxtConfig({
  content: {
    documentDrivers: [{ name: 'fs', driver: 'filesystem' }],

    // Collections for MD lessons
    collections: {
      // Dictionary word/phrase rows (C1T01, C1T02, etc.)
      dictionary: {
        source: 'content/{locale}/dictionary/*.{md,mdx}',
        alias: ['dictionary'],
      },

      // Lecture articles (C1T01A alphabet article, tutorials, etc.)
      lectures: {
        source: 'content/{locale}/lectures/*.{md,mdx}',
        alias: ['lectures'],
      },

      // Stories and narratives (future)
      stories: {
        source: 'content/{locale}/stories/*.{md,mdx}',
        alias: ['stories'],
      },
    },

    // Front matter schema for content collections
    schema: {
      dictionary: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          article: { type: 'boolean', default: false }, // is this a prose article?
          published: { type: 'boolean', default: true },
        },
      },
      lectures: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          published: { type: 'boolean', default: true },
        },
      },
      stories: {
        fields: {
          id: { type: 'string', required: true },
          locale: { type: 'string', required: true },
          title: { type: 'string', required: false },
          description: { type: 'string', required: false },
          track: { type: 'string', required: true },
          chapter: { type: 'string', required: false },
          sidebar: { type: 'string', required: false }, // topic-map.json key
          published: { type: 'boolean', default: true },
        },
      },
    },
  },

  // Nuxt config: enumerate doc routes for each track
  pages: {
    middleware: {
      // Route docs via /learn/{locale}/{track}/{topic}/{id}/{doc}
    },
  },
});
