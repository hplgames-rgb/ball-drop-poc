# HPL Ball Drop Alpha — Build 9.9

This project converts the known-good single-file **Build 9.5** into a small Vite app so
Reown AppKit / WalletConnect can be installed and bundled normally.

## What changed

- Ball Drop gameplay, Supabase, rewards, reflections, DEX, marketplace, splash, tablet fit,
  and fullscreen remain in `index.html`.
- Reown AppKit is installed through npm instead of a CDN.
- `src/appkit.js` owns wallet discovery/WalletConnect and passes the connected EVM provider
  and address into the existing Ball Drop code.
- The Reown Project ID is already configured:
  `ab7678a08e393da8bb80dfdac385d495`
- Network is restricted to **Base Sepolia**.

## Deploy to GitHub Pages

1. Back up the current `ball-drop-poc` repository first.
2. Copy **all files and folders from this project** into the repository root.
3. Commit/push to the `main` branch.
4. In GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. Open the repository **Actions** tab and wait for
   `Deploy Ball Drop to GitHub Pages` to complete.
6. Load:
   `https://hplgames-rgb.github.io/ball-drop-poc/?v=98`

The visible build marker should say **BUILD 9.9**.

## Local testing (optional)

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Vite will print a localhost URL.

## Reown configuration

The Reown dashboard origin should allow:

`https://hplgames-rgb.github.io`

The AppKit metadata URL uses that same origin.

## Rollback

Your previous single-file Build 9.5 remains your known-good rollback point.
If 9.9 has a problem, restore the old `index.html` and switch GitHub Pages back to
the previous deployment method if necessary.


## Build 9.9 changes

- Mobile Reown/AppKit chooser is explicitly closed after Ball Drop has adopted the connected wallet.
- Bottom scoring no longer requires the ball to be almost exactly centered; any ball that reaches the funnel exit scores exactly once.
- Round timing and shared paddle multiplier timing are calibrated against Base Sepolia's latest block timestamp to reduce multi-device local-clock drift.
