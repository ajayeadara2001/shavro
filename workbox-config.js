/**
 * Shavro V1 — Production PWA Service Worker
 *
 * This configuration runs after Expo exports
 * the production web application.
 *
 * It caches application files only.
 *
 * Financial records remain managed by
 * Shavro's existing storage services.
 *
 * Do not add financial data, API responses,
 * backup files, or user-generated content
 * to the precache.
 */

module.exports = {
  // Expo production output.
  globDirectory: "dist",

  // Files required for the application shell.
  globPatterns: [
    "**/*.{js,css,html,json}",
    "**/*.{png,jpg,jpeg,webp,svg,ico}",
    "**/*.{woff,woff2,ttf,otf}",
  ],

  // Never cache source maps or accidental
  // backup files in the application shell.
  globIgnores: [
    "**/*.map",
    "**/*.bak",
    "**/*.backup",
    "**/*.sqlite",
    "**/*.db",
    "**/*.zip",
  ],

  // Prevent unexpectedly large assets
  // from being silently precached.
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,

  // Generated service worker location.
  swDest: "dist/sw.js",

  // Single-page Shavro application.
  navigateFallback: "/index.html",

  // Do not redirect API requests or
  // application service endpoints to HTML.
  navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/sw\.js$/],

  // Workbox maintains versioned asset caches.
  cleanupOutdatedCaches: true,

  // Do not force an updated worker to take
  // over an existing financial app session.
  skipWaiting: false,
  clientsClaim: false,

  // Safe parameters to ignore for caching.
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],

  // Avoid broad runtime caching.
  // Only generated build assets are precached.
  runtimeCaching: [],

  // Build optimized production worker.
  mode: "production",
};
