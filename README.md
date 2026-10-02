# BrickTown

Trò chơi LEGO 3D cho trẻ em trên máy tính bảng và điện thoại (PWA, chơi offline). A 3D LEGO-style web game for kids on tablets and phones, an offline PWA.

Stack: Vite, React 19, TypeScript (strict), @react-three/fiber, zustand, dexie.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (vitest)
npm run lint
npm run build        # type-check + production build into dist/
npm run e2e          # Playwright against the dev server
npm run e2e:offline  # Playwright against the production build (port 4173)
```

Node `^20.19.0 || >=22.12.0` is required (Vite 8).

## Deploy (Cloudflare Pages)

Tiếng Việt: đẩy code lên GitHub, nối repo `dungpv007/bricktown` với Cloudflare Pages là xong; mỗi lần push lên `main` trang `bricktown.pages.dev` tự cập nhật.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick `dungpv007/bricktown`.
2. Framework preset: **None** (or Vite). Build command: `npm run build`. Build output directory: `dist`.
3. Environment variable `NODE_VERSION` = `22` (Vite 8 needs Node 20.19+ or 22.12+; Pages' default Node is older).
4. Save and deploy. The site is served at `https://bricktown.pages.dev` (free, no custom domain needed).

Every push to `main` deploys to production; every other branch gets its own preview URL.

Notes:

- `public/_headers` sets the cache rules (the service worker, `index.html` and the manifest are always revalidated; `/assets/*` is immutable) and security headers. It is copied into `dist/` by the build.
- The app uses hash routing, so no SPA fallback (`_redirects`) is needed.
- `VITE_SHARE_BASE_URL` is optional and normally left unset: share links use the address the game is open at. See `.env.example`.
- Optional CLI deploy (needs a Cloudflare login): `npm run build && npx wrangler pages deploy dist`. `wrangler.jsonc` holds the project name and output directory; wrangler is not a project dependency.

**Warning: saves are tied to the domain.** The kids' creations live in the browser's IndexedDB, which belongs to one origin. If you later move to a custom domain, the saves stay on the old `bricktown.pages.dev` address and the new domain starts empty. Keep the old address working, or have the kids share (export) their creations before switching.
