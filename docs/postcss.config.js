// Shadows the parent component-library's postcss.config.js (Tailwind v4 +
// ESM `export default`) so Next.js's webpack doesn't walk up and pick up a
// config meant for a different, ESM-only project. This one processes
// docs/app/globals.css so live component examples (which use
// react-component-library's Tailwind classes) render correctly.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
