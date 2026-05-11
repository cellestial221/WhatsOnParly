# WhatsOnParly

A single-page tool that fetches the UK Parliament weekly calendar and renders it as Gmail-compatible HTML tables, ready to paste into an email newsletter.

## What it does

- Fetches events from the [UK Parliament What's On Calendar API](https://whatson-api.parliament.uk)
- Displays House of Commons and House of Lords events for any week
- Formats them as styled HTML tables with inline CSS (so they survive Gmail's style stripper)
- Lets you copy either table (or both) directly to the clipboard as rich HTML, ready to paste into Gmail

## How to use

1. Open the tool (see deployment below)
2. The date range defaults to the coming week — adjust if needed
3. Click **Generate** (or change dates — it auto-fetches)
4. Click **Copy both tables**, **Commons only**, or **Lords only**
5. Paste into your Gmail draft

## Running locally

The page uses ES modules (`type="module"`), which require an HTTP server — opening `index.html` directly from disk won't work.

```bash
# Python (no install needed)
python3 -m http.server 8765
# then open http://localhost:8765
```

## Deploying to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose `main` branch, `/ (root)` folder
5. Click **Save** — the site will be live at `https://<username>.github.io/<repo>/` in a minute or two

No build step, no dependencies. The `.nojekyll` file tells GitHub Pages not to run Jekyll processing.

## Files

| File | Purpose |
|---|---|
| `index.html` | UI — controls, copy buttons, output area |
| `api.js` | Data layer — fetches and parses Parliament API responses |
| `render.js` | Rendering layer — produces Gmail-compatible HTML tables |
| `NOTES.md` | API documentation and data shape reference |
| `samples/` | Sample API responses for development |

## Data source

Events come from the [UK Parliament What's On Calendar API](https://whatson-api.parliament.uk). This tool is not affiliated with or endorsed by UK Parliament.
