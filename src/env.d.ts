// Static asset module declarations for Vite imports used inside Vue SFCs
// (e.g. `import earthLogoWhite from '~/assets/img/earth-logo-white.png'`).
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
