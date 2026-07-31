# public/

Static files served at the root of the site.

## The Outskill logo

**`outskill-logo.svg` in this folder is a placeholder, not the official Outskill mark.**

The official logo has deliberately not been recreated or redrawn. Until the real asset is supplied,
the app renders a clean text wordmark reading "OUTSKILL".

### To use the official logo

1. Save the official file here, named exactly **`outskill-logo.svg`**, replacing the placeholder.
   - SVG is preferred so it stays sharp on the 1920×1080 LED display.
   - A PNG works too — rename it `outskill-logo.svg`, or edit
     `src/components/ui/wordmark.tsx` to point at the new filename.
   - It should read clearly on the near-black background (`#070807`). A white or light version is
     usually right.
   - Aim for a wide aspect ratio (roughly 4:1). The component sizes by height: 18px in admin chrome,
     24px in page headers, 56px on the LED display.
2. Set this environment variable in `.env.local` and in your Vercel project settings:

   ```
   NEXT_PUBLIC_HAS_OFFICIAL_LOGO=1
   ```

3. Redeploy (or restart `npm run dev`). Check `/`, `/display` and `/admin` — the wordmark component is
   used on all three.

This flag is intentionally public: it controls presentation only and holds no secret.
