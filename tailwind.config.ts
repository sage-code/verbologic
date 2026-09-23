import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './src/app.vue',
    './src/components/**/*.{vue,js,ts}',
    './src/layouts/**/*.vue',
    './src/pages/**/*.vue',
    './src/composables/**/*.{js,ts}',
    './src/stores/**/*.{js,ts}',
    './src/lib/**/*.{js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens — values live in src/assets/css/themes.css
        // (:root light, [data-theme="dark"] dark). Components use these.
        body: 'var(--color-body)',
        surface: 'var(--color-surface)',
        soft: 'var(--color-surface-soft)',
        content: 'var(--color-content)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        edge: 'var(--color-edge)',
        'edge-strong': 'var(--color-edge-strong)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          strong: 'var(--color-accent-strong)',
          soft: 'var(--color-accent-soft)'
        },
        'on-accent': 'var(--color-on-accent)',
        // Legacy brand palette (kept for existing references).
        brand: {
          50: '#eef4ff',
          500: '#3b6ee0',
          600: '#2f5bc4',
          700: '#264a9e'
        }
      },
      fontFamily: {
        // Typography tokens (defined in src/assets/css/tailwind.css).
        // `sans` is the site default → Tailwind preflight inherits Inter.
        sans: 'var(--font-body)',
        body: 'var(--font-body)',
        ui: 'var(--font-ui)',
        header: 'var(--font-header)',
        code: 'var(--font-code)'
      }
    }
  },
  plugins: []
}
