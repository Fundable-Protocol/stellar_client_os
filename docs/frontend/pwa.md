# Fundable PWA and offline behavior

The web client exposes a root-scoped web app manifest and registers `/sw.js` in production over HTTPS (or localhost). The manifest provides standalone display, the Fundable theme/background colors, 192px and 512px PNG icons, a maskable icon, and the app start URL. Android-capable browsers generate a launch screen from the manifest colors and app icon; an iOS startup image is linked from the root layout.

## Offline behavior

- The service worker pre-caches the offline fallback, manifest, PNG/SVG icons, and startup image.
- Same-origin hashed Next.js assets are cached as they are requested.
- Public campaign list/detail GET responses are reduced to a small allowlisted summary before being stored in IndexedDB. Creator emails, wallet/session data, donation details, and arbitrary API fields are not persisted.
- If a campaign API request fails offline, the worker returns saved campaign summaries when available.
- A campaign detail view also writes its public summary to IndexedDB. Opening `/offline.html` lists those summaries and links back to their campaign URLs.
- Wallet connections, donations, and other network-backed actions are not represented as available offline.

## Install prompt

Browsers that support `beforeinstallprompt` receive a native install action. On iOS, where that event is not exposed, the prompt explains how to use Safari's Share menu and choose **Add to Home Screen**. The prompt can be dismissed and its dismissal is stored locally.

## Deployment notes

Serve the app over HTTPS in production. Service workers are deliberately not registered in development to avoid caching the development server's hot-reload assets. Clear site storage or unregister the service worker when testing a clean install.
