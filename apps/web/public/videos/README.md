Product demo assets for `/demo` and onboarding:

```text
apps/web/public/videos/
  product-demo.mp4          # primary (H.264)
  product-demo.webm         # optional WebM fallback
  product-demo-poster.jpg   # thumbnail before play
  .recording/               # source recordings (not required in production)
```

The demo video shows a **Hebrew (RTL) haknasot workflow**: fill the municipal income form, assign all 11 municipal approval signers with Hebrew role titles, review, and send for signature.

### Prerequisites

1. Dev servers running: `npm run dev` (web + API)
2. Bypass auth enabled in `apps/web/.env.local` and `apps/api/.env.local`:
   - `BYPASS_AUTH=true`
   - `BYPASS_TOKEN=dev-bypass-token-local`
   - `NEXT_PUBLIC_BYPASS_AUTH=true`
   - `NEXT_PUBLIC_BYPASS_TOKEN=dev-bypass-token-local`

### Record / refresh

```bash
npm run dev              # terminal 1
npm run record:demo      # terminal 2 — seeds signers + records Hebrew flow
```

Seed signer profiles only (no recording):

```bash
npm run seed:demo-signers
```

Signer data lives in `scripts/demo-hebrew-signers.json`.

Manual re-encode from an existing WebM source:

```bash
ffmpeg -y -i apps/web/public/videos/.recording/product-demo.webm \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart \
  apps/web/public/videos/product-demo.mp4

cp apps/web/public/videos/.recording/product-demo.webm apps/web/public/videos/product-demo.webm

ffmpeg -y -i apps/web/public/videos/product-demo.mp4 -ss 00:00:04 -vframes 1 \
  apps/web/public/videos/product-demo-poster.jpg
```

The shared `ProductDemoVideo` component serves both `/demo` and `/onboarding`.
