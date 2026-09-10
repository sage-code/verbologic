// Vite asset imports for SVG files (flag-icons) resolve to URL strings.
declare module '*.svg' {
  const src: string
  export default src
}
