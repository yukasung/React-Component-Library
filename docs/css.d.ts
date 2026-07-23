// InputDate imports flatpickr's CSS and its own theme override as plain,
// non-module side-effect imports (`import 'flatpickr/dist/flatpickr.css'`)
// — Next's built-in ambient types only cover `*.module.css`, not this. This
// project resolves `react-component-library` straight to its TS source (see
// next.config.mjs / tsconfig.json's `paths`), so `next build`'s type-check
// pass walks into that source and needs this declared here too.
declare module '*.css'
