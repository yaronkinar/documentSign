Product demo assets for `/demo` and onboarding:

```text
apps/web/public/videos/
  product-demo.mp4          # primary (H.264)
  product-demo.webm         # optional WebM fallback
  product-demo-poster.jpg   # thumbnail before play
  .recording/               # source recordings (not required in production)
```

To refresh the demo video after UI changes:

```bash
npm run dev          # in one terminal (web + API)
npm run record:demo  # records tour, dashboard, new doc, settings, demo page
```

Manual re-encode from an existing WebM source:

```bash
ffmpeg -y -i apps/web/public/videos/.recording/product-demo.webm \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart \
  apps/web/public/videos/product-demo.mp4

cp apps/web/public/videos/.recording/product-demo.webm apps/web/public/videos/product-demo.webm

ffmpeg -y -i apps/web/public/videos/product-demo.mp4 -ss 00:00:01 -vframes 1 \
  apps/web/public/videos/product-demo-poster.jpg
```

The shared `ProductDemoVideo` component serves both `/demo` and `/onboarding`.
