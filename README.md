# playnext — frontend

React + Vite frontend for a café/gym/restaurant music queue system.

Routes:
- `/` — landing page
- `/:venueSlug` — customer-facing queue for a venue (QR code target)
- `/:venueSlug/admin` — venue owner's control panel

Using clean URLs (`playnext.com/cafename/admin`) via `BrowserRouter` +
a GitHub Pages routing workaround, rather than hash-based URLs — cleaner
for QR codes and looks more like a real product.

## Local setup

```bash
npm install
cp .env.example .env.local   # then point VITE_API_BASE at your backend
npm run dev
```

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Install deploy dependency (already in devDependencies) and run:
   ```bash
   npm run deploy
   ```
   This builds the app and pushes `dist/` to a `gh-pages` branch.
3. In the repo's **Settings → Pages**, set the source to the `gh-pages`
   branch.
4. For a custom domain (`playnext.com`):
   - Add a `CNAME` record at your DNS provider pointing `playnext.com` (or
     a subdomain) at `<yourusername>.github.io`.
   - In **Settings → Pages**, enter `playnext.com` as the custom domain —
     GitHub will create a `CNAME` file in the published branch
     automatically and provision HTTPS.

## Why there's a `public/404.html`

GitHub Pages is a static host with no server-side routing, so a direct hit
on `playnext.com/some-cafe/admin` would 404. The `404.html` in `public/`
redirects into `index.html` with the real path encoded in the query
string; a small inline script in `index.html` decodes it back before React
Router mounts. This is the standard
[spa-github-pages](https://github.com/rafgraph/spa-github-pages) trick —
don't delete either file, and don't rename them.

## Backend

This frontend expects a REST API (see `src/config.js` for the base URL)
with endpoints roughly like:

- `GET /venues/:slug` — venue info (name, mode, etc.)
- `GET /venues/:slug/queue` — current queue
- `POST /venues/:slug/queue` — add a song
- `POST /venues/:slug/admin/login` — exchange admin code for a session token
- `DELETE /venues/:slug/queue/:itemId` — admin removes a song
- `POST /venues/:slug/ban` — admin bans a track

None of this exists yet — it's the next thing to build, likely on Render.
