import type * as THREE from 'three';

/**
 * Ultra-fast high-precision terrain heightmap processing for 3D visualization.
 * Designed to execute in under 15ms without blocking the browser UI thread.
 * 
 * 1. Fast Outlier Despiking: eliminates raycast needle spikes (poles, masts, foliage).
 * 2. Separable Edge-Preserving Bilateral Smoothing: eliminates 8-bit quantization steps
 *    while maintaining sharp mountain ridgelines, cliffs, and road contours.
 * 3. Direct grid mapping & native vertex normal computation.
 */

/**
 * Fast in-place despike filter on a 2D float grid.
 * If a pixel is strictly higher (or lower) than all its 8 neighbors by more than spikeThreshold,
 * it is an isolated impulse noise spike (e.g. hitting a pole or antenna) and is clamped.
 */
function fastDespike(grid: Float32Array, res: number, spikeThreshold: number) {
  for (let y = 1; y < res - 1; y++) {
    const row = y * res;
    for (let x = 1; x < res - 1; x++) {
      const idx = row + x;
      const val = grid[idx];

      let maxN = -Infinity;
      let minN = Infinity;

      // Check 8 neighbors
      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * res;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const n = grid[nRow + (x + dx)];
          if (n > maxN) maxN = n;
          if (n < minN) minN = n;
        }
      }

      if (val > maxN + spikeThreshold) {
        grid[idx] = maxN;
      } else if (val < minN - spikeThreshold) {
        grid[idx] = minN;
      }
    }
  }
}

/**
 * Fast separable edge-preserving bilateral filter on a 2D grid.
 * Horizontal pass followed by vertical pass: O(res^2 * radius) complexity (~3ms on 513x513).
 */
function fastSeparableBilateral(
  src: Float32Array,
  temp: Float32Array,
  dst: Float32Array,
  res: number,
  sigmaRange: number
) {
  const twoRangeSq = 2 * sigmaRange * sigmaRange;

  // Spatial weights for radius 2: [-2, -1, 0, 1, 2]
  const w0 = 1.0;
  const w1 = 0.65;
  const w2 = 0.25;

  // 1. Horizontal pass
  for (let y = 0; y < res; y++) {
    const row = y * res;
    // Edges copy
    temp[row] = src[row];
    temp[row + 1] = src[row + 1];
    temp[row + res - 2] = src[row + res - 2];
    temp[row + res - 1] = src[row + res - 1];

    for (let x = 2; x < res - 2; x++) {
      const c = src[row + x];

      const p_2 = src[row + x - 2];
      const p_1 = src[row + x - 1];
      const p1 = src[row + x + 1];
      const p2 = src[row + x + 2];

      const r_2 = Math.exp(-((p_2 - c) * (p_2 - c)) / twoRangeSq) * w2;
      const r_1 = Math.exp(-((p_1 - c) * (p_1 - c)) / twoRangeSq) * w1;
      const r1 = Math.exp(-((p1 - c) * (p1 - c)) / twoRangeSq) * w1;
      const r2 = Math.exp(-((p2 - c) * (p2 - c)) / twoRangeSq) * w2;

      const sumWeights = w0 + r_2 + r_1 + r1 + r2;
      const sumVals = c * w0 + p_2 * r_2 + p_1 * r_1 + p1 * r1 + p2 * r2;

      temp[row + x] = sumVals / sumWeights;
    }
  }

  // 2. Vertical pass
  for (let x = 0; x < res; x++) {
    dst[x] = temp[x];
    dst[res + x] = temp[res + x];
    dst[(res - 2) * res + x] = temp[(res - 2) * res + x];
    dst[(res - 1) * res + x] = temp[(res - 1) * res + x];
  }

  for (let y = 2; y < res - 2; y++) {
    const row = y * res;
    for (let x = 0; x < res; x++) {
      const c = temp[row + x];

      const p_2 = temp[(y - 2) * res + x];
      const p_1 = temp[(y - 1) * res + x];
      const p1 = temp[(y + 1) * res + x];
      const p2 = temp[(y + 2) * res + x];

      const r_2 = Math.exp(-((p_2 - c) * (p_2 - c)) / twoRangeSq) * w2;
      const r_1 = Math.exp(-((p_1 - c) * (p_1 - c)) / twoRangeSq) * w1;
      const r1 = Math.exp(-((p1 - c) * (p1 - c)) / twoRangeSq) * w1;
      const r2 = Math.exp(-((p2 - c) * (p2 - c)) / twoRangeSq) * w2;

      const sumWeights = w0 + r_2 + r_1 + r1 + r2;
      const sumVals = c * w0 + p_2 * r_2 + p_1 * r_1 + p1 * r1 + p2 * r2;

      dst[row + x] = sumVals / sumWeights;
    }
  }
}

/**
 * Helper to draw non-square heightmap images onto a square canvas with proper letterboxing/pillarboxing
 * so that non-square maps (e.g. Rohkshort 4096x2377, Dustbowl 2972x3442) align 1:1 with the 1024x1024
 * letterboxed satellite map textures.
 */
export function drawLetterboxedHeightmap(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): { drawX: number; drawY: number; drawW: number; drawH: number } {
  const aspect = img.width / img.height;
  const targetAspect = targetW / targetH;
  let drawX = 0;
  let drawY = 0;
  let drawW = targetW;
  let drawH = targetH;

  if (Math.abs(aspect - targetAspect) > 0.02) {
    if (aspect > targetAspect) {
      // Widescreen heightmap (e.g. Rohkshort: aspect = 1.72)
      drawH = Math.round(targetW / aspect);
      drawY = Math.round((targetH - drawH) / 2);
    } else {
      // Tall heightmap (e.g. Dustbowl: aspect = 0.86)
      drawW = Math.round(targetH * aspect);
      drawX = Math.round((targetW - drawW) / 2);
    }
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Replicate edge rows/cols into margins so terrain doesn't form sudden artificial cliffs
  if (drawY > 0) {
    // Top margin
    ctx.drawImage(ctx.canvas, 0, drawY, targetW, 1, 0, 0, targetW, drawY);
    // Bottom margin
    const botY = drawY + drawH;
    if (botY < targetH) {
      ctx.drawImage(ctx.canvas, 0, botY - 1, targetW, 1, 0, botY, targetW, targetH - botY);
    }
  }
  if (drawX > 0) {
    // Left margin
    ctx.drawImage(ctx.canvas, drawX, 0, 1, targetH, 0, 0, drawX, targetH);
    // Right margin
    const rightX = drawX + drawW;
    if (rightX < targetW) {
      ctx.drawImage(ctx.canvas, rightX - 1, 0, 1, targetH, rightX, 0, targetW - rightX, targetH);
    }
  }

  return { drawX, drawY, drawW, drawH };
}

/**
 * High-performance 3D heightmap processor and applier.
 *
 * Fast Bilateral Heightfield Pipeline:
 * Hardware 2D rasterizer -> Despike -> Separable 1D Bilateral Gauss.
 * Executes in ~15ms for any resolution (including massive 16M-pixel 4044x4044 maps),
 * eliminating the need to iterate through multi-million pixel source images on the CPU thread.
 */
export function applySmoothHeightmapToMesh(
  geometry: THREE.BufferGeometry,
  img: HTMLImageElement,
  minHeight: number,
  maxHeight: number,
  segments: number,
  mapSize = 1.0
): { getHeightAtWorld: (wx: number, wz: number) => number } {
  const gridRes = segments + 1; // 513 for 512 segments
  const totalVertices = gridRes * gridRes;
  const heightRange = maxHeight - minHeight;

  // 1. Instant hardware-accelerated bilinear/bicubic downsample via Canvas 2D with aspect-ratio letterboxing
  const canvas = document.createElement('canvas');
  canvas.width = gridRes;
  canvas.height = gridRes;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { getHeightAtWorld: () => 0 };
  }

  drawLetterboxedHeightmap(ctx, img, gridRes, gridRes);

  const rawPixels = ctx.getImageData(0, 0, gridRes, gridRes).data;

  // 2. Convert to float heights (studs)
  const heights = new Float32Array(totalVertices);
  for (let i = 0; i < totalVertices; i++) {
    const val = rawPixels[i * 4] / 255.0;
    heights[i] = minHeight + val * heightRange;
  }

  // 3. Fast In-Place Despike (removes isolated antenna/pole/foliage raycast spikes)
  const spikeThreshold = Math.max(5.0, heightRange / 50.0);
  fastDespike(heights, gridRes, spikeThreshold);

  // 4. Fast Separable Bilateral Filter (smooths 8-bit terracing, preserves cliff edges)
  const temp = new Float32Array(totalVertices);
  const smoothed = new Float32Array(totalVertices);
  const sigmaRange = Math.max(4.0, heightRange / 60.0);

  fastSeparableBilateral(heights, temp, smoothed, gridRes, sigmaRange);

  // 5. Update mesh positions (1:1 true game scale)
  const positions = geometry.attributes.position;
  for (let i = 0; i < totalVertices; i++) {
    positions.setY(i, smoothed[i]);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  // 6. Fast continuous bilinear height lookup at any 3D world coordinate (X, Z)
  const getHeightAtWorld = (wx: number, wz: number): number => {
    // In Map3D: plane geometry is size x size centered at (0, 0)
    // Normalized UV:
    const u = Math.max(0, Math.min(1, wx / mapSize + 0.5));
    const v = Math.max(0, Math.min(1, wz / mapSize + 0.5));

    const fx = u * (gridRes - 1);
    const fy = v * (gridRes - 1);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;

    const ix1 = Math.min(gridRes - 1, ix + 1);
    const iy1 = Math.min(gridRes - 1, iy + 1);

    const h00 = smoothed[iy * gridRes + ix];
    const h10 = smoothed[iy * gridRes + ix1];
    const h01 = smoothed[iy1 * gridRes + ix];
    const h11 = smoothed[iy1 * gridRes + ix1];

    const hTop = h00 * (1 - tx) + h10 * tx;
    const hBot = h01 * (1 - tx) + h11 * tx;
    return hTop * (1 - ty) + hBot * ty;
  };

  return { getHeightAtWorld };
}
