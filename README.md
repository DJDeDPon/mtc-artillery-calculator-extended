# mtc-artillery-calculator-extended

Extended artillery calculator for Multicrew Tank Combat (MTC) on Roblox.
Based on the original calculator by Astrid (grand-hawk).

## What is this

This tool calculates firing angles (low and high arc elevation), azimuth, time of flight, and distance for artillery vehicles in MTC.

This extended version adds an interactive 3D terrain mode, fixes heightmap scaling bugs on non-square maps, and adds dynamic trajectory visualization.

## Features added in Extended

- 3D Terrain View: Full 3D rendering of map topography using Three.js.
- Bilateral Heightmap Smoothing: Fast hardware-downsampled bilateral filter for 3D terrain mesh to eliminate 8-bit stepped terracing without freezing the browser or altering raw calculation heights.
- Ground Snapping: Artillery gun and target markers snap to the terrain surface.
- Dynamic 3D Trajectories: Both direct fire and high-angle mortar trajectory arcs calculated and rendered in 3D, landing on the target point.
- 3D Range Circle: Terrain-conforming dashed circle showing maximum gun range for the selected projectile.
- Aspect Ratio Alignment: Fixed a scaling mismatch on non-square maps (such as Rohkshort and Dustbowl) where the heightmap was stretched relative to the satellite texture.
- Static Deployment: Configured with SvelteKit static adapter for direct hosting on GitHub Pages or any static CDN.

## Tech stack

- Svelte 5 (runes)
- Vite 8
- Three.js
- Tailwind CSS

## Development

Install dependencies:

```bash
npm install
```

Start local dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Credits & License

- Original project: https://github.com/grand-hawk/artillery-calculator by Astrid.
- Extended modifications: https://github.com/DJDeDPon/mtc-artillery-calculator-extended by DJDeDPon.
- Thanks to Google Gemini and Anthropic Claude for assistance with development and ballistics mathematics.
- License: MIT
