// Shadows the parent component-library's postcss.config.js (Tailwind v4 +
// ESM `export default`) so Next.js's webpack doesn't walk up and pick up a
// config meant for a different, ESM-only project. The docs site doesn't
// need Tailwind processing of its own — nextra-theme-docs ships its own
// compiled CSS.
module.exports = {
  plugins: {},
}
