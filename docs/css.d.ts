// The package root imports its plain publication stylesheet, which includes
// flatpickr's base/theme CSS. Next's built-in ambient types only cover
// `*.module.css`; this project resolves `@yukasung/react-components` straight
// to its TS source (see next.config.mjs / tsconfig.json's `paths`), so
// `next build`'s type-check pass needs this declared here too.
declare module '*.css'
