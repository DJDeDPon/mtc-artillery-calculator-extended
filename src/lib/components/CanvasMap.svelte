<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '$lib/store.svelte';
  import { getMapImageUrl, getHeightmapImageUrl } from '$lib/utils/images';
  import {
    calculateBlastDiameter,
    calculateSubmunitionBlastDiameter,
    calculateMaxRangeDiameter,
    metersToStuds,
    studsToMeters,
  } from '$lib/utils/math';
  import { drawLetterboxedHeightmap } from '$lib/utils/heightmap3d';

  let { toggle3DMode }: { toggle3DMode: () => void } = $props();

  let containerEl: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let hmCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let hmCtx: CanvasRenderingContext2D | null = null;
  let animationId: number;

  let mapImage: HTMLImageElement | null = null;
  let heightmapImage: HTMLImageElement | null = null;
  let mapLoaded = $state(false);

  let currentMapName = '';

  let panX = $state(0);
  let panY = $state(0);

  let isDraggingGun = false;
  let isDraggingTarget = false;
  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Base map render dimension before zoom (fits comfortably inside canvas)
  let baseMapSize = $derived.by(() => {
    if (!canvas) return 800;
    const padding = 60;
    return Math.max(300, Math.min(canvas.width - padding * 2, canvas.height - padding * 2));
  });

  // Effect to load Map and Heightmap images when mapId changes
  $effect(() => {
    const currentMap = appState.currentMap;
    if (currentMap.name !== currentMapName) {
      currentMapName = currentMap.name;
      mapLoaded = false;
      mapImage = null;
      heightmapImage = null;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = getMapImageUrl(currentMap.image, { q: 90 });
      img.onload = () => {
        mapImage = img;
        mapLoaded = true;
      };

      if (currentMap.heightmap) {
        const hmImg = new Image();
        hmImg.crossOrigin = 'anonymous';
        hmImg.src = getHeightmapImageUrl(currentMap.image);
        hmImg.onload = () => {
          heightmapImage = hmImg;
          if (hmCtx && hmCanvas) {
            const size = Math.max(hmImg.width, hmImg.height);
            hmCanvas.width = size;
            hmCanvas.height = size;
            drawLetterboxedHeightmap(hmCtx, hmImg, size, size);
            updateHeights();
          }
        };
      } else {
        heightmapImage = null;
        appState.setHeights(0, 0);
      }
    }
  });

  // Re-read heights when gun or target move
  $effect(() => {
    appState.gun;
    appState.target;
    updateHeights();
  });

  function updateHeights() {
    if (!hmCtx || !hmCanvas || !appState.currentMap.heightmap || !heightmapImage) {
      appState.setHeights(0, 0);
      return;
    }
    const { 0: minHeight, 255: maxHeight } = appState.currentMap.heightmap;
    const w = hmCanvas.width;
    const h = hmCanvas.height;

    try {
      const gx = Math.round(appState.gun.x * (w - 1));
      const gy = Math.round(appState.gun.y * (h - 1));
      const gPixel = hmCtx.getImageData(gx, gy, 1, 1).data[0];
      const gunH = minHeight + (gPixel / 255) * (maxHeight - minHeight);

      const tx = Math.round(appState.target.x * (w - 1));
      const ty = Math.round(appState.target.y * (h - 1));
      const tPixel = hmCtx.getImageData(tx, ty, 1, 1).data[0];
      const targetH = minHeight + (tPixel / 255) * (maxHeight - minHeight);

      appState.setHeights(gunH, targetH);
    } catch {
      // Ignore cross-origin canvas read if any
    }
  }

  function render() {
    if (!ctx || !canvas) return;

    // Handle high DPI / resizing
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    const cw = canvas.width;
    const ch = canvas.height;

    // Background fill
    ctx.fillStyle = '#0e0e11';
    ctx.fillRect(0, 0, cw, ch);

    // Subtle background grid
    drawBackgroundGrid(ctx, cw, ch);

    const size = baseMapSize;
    const zoom = appState.zoom;

    ctx.save();
    // Center the map in viewport with panning and zoom
    ctx.translate(cw / 2 + panX, ch / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-size / 2, -size / 2);

    // 1. Draw Map Drop Shadow & Border
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#18181c';
    ctx.fillRect(0, 0, size, size);
    ctx.shadowColor = 'transparent';

    // 2. Draw Map Image
    if (mapImage && mapLoaded) {
      ctx.drawImage(mapImage, 0, 0, size, size);
    } else {
      // Loading placeholder
      ctx.fillStyle = '#1e1e24';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#666';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading map image...', size / 2, size / 2);
    }

    // Map Border frame
    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(0, 0, size, size);

    // Positions in map pixels
    const gunX = appState.gun.x * size;
    const gunY = appState.gun.y * size;
    const targetX = appState.target.x * size;
    const targetY = appState.target.y * size;

    const gameMap = appState.currentMap;
    const projectile = appState.currentProjectile;

    // 3. Calculate and Draw Blast Radius / Cluster Dispersion
    let isCluster = Boolean(projectile.submunitions && projectile.submunitionAngularDispersion);
    let blastDiameter: number | undefined;

    if (isCluster) {
      const [lowElev, highElev] = appState.elevation;
      const validElev = lowElev ?? highElev ?? 45;
      blastDiameter = calculateSubmunitionBlastDiameter(
        projectile.submunitionAngularDispersion!,
        projectile.velocity,
        validElev,
        projectile.submunitionDeployFactor,
      );
    } else if (projectile.explosiveMass) {
      blastDiameter = calculateBlastDiameter(
        projectile.explosiveMass,
        projectile.capMultiplier,
        projectile.blastMultiplier,
      );
    }

    const blastRadiusPx = blastDiameter ? (blastDiameter / gameMap.size / 2) * size : 0;

    if (blastRadiusPx > 0) {
      if (isCluster) {
        // CLUSTER DISPERSION MODEL:
        // The shell opens before reaching target. Submunitions eject into a cone
        // and scatter forward by inertia.
        // On the map this appears as a TRIANGULAR WEDGE (pyramid).
        
        const dx = targetX - gunX;
        const dy = targetY - gunY;
        const trajectoryAngle = Math.atan2(dy, dx);

        // Instead of scaling by total distance (which makes the cone start way too early
        // at long ranges), we scale the cone length relative to the calculated lateral dispersion.
        // Forward dispersion is typically ~3x the lateral dispersion for cluster munitions.
        const wedgeLength = blastRadiusPx * 3.2;
        
        // The lateral radius (half-width) at the end of the wedge
        const maxHalfWidth = blastRadiusPx * 0.85;

        // Shift the apex back along the trajectory so the target lies inside the cone,
        // typically around 40-50% of the way along the wedge length.
        const apexOffset = wedgeLength * 0.45;
        
        const burstX = targetX - Math.cos(trajectoryAngle) * apexOffset;
        const burstY = targetY - Math.sin(trajectoryAngle) * apexOffset;

        ctx.save();
        ctx.translate(burstX, burstY);
        ctx.rotate(trajectoryAngle);

        // Draw the triangular wedge
        ctx.beginPath();
        ctx.moveTo(0, 0); // apex at burst point
        ctx.lineTo(wedgeLength, -maxHalfWidth); // top edge
        ctx.lineTo(wedgeLength, maxHalfWidth);  // bottom edge
        ctx.closePath();

        // Gradient fill — faint at apex, denser in the middle, fading at tip
        const grad = ctx.createLinearGradient(0, 0, wedgeLength, 0);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.05)');
        grad.addColorStop(0.3, 'rgba(245, 158, 11, 0.3)');
        grad.addColorStop(0.6, 'rgba(245, 158, 11, 0.2)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.05)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Dashed perimeter
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.lineWidth = 1.2 / zoom;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.stroke();

        // Submunition impact dots — distributed within the triangle
        const numDots = Math.min(projectile.submunitions || 20, 35);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
        for (let i = 0; i < numDots; i++) {
          const t = (i + 0.5) / numDots;
          // Forward position: along the wedge.
          // We use a slight curve so dots are a bit denser near the middle/end.
          const fwdT = 0.1 + Math.pow(t, 0.8) * 0.85; 
          const fwd = fwdT * wedgeLength;

          // Width at this forward position (linear expansion like a pyramid)
          const widthAtFwd = maxHalfWidth * (fwd / wedgeLength);

          // Lateral offset: we want it to look somewhat random but filling the V shape.
          const lateralAngle = i * 2.39996;
          // Multiply by a factor to spread them inside the width
          const lat = Math.sin(lateralAngle) * widthAtFwd * 0.9;

          ctx.beginPath();
          ctx.arc(fwd, lat, Math.max(1.5, 2.0 / zoom), 0, Math.PI * 2);
          ctx.fill();
        }

        // Small direction arrow near the end of the wedge
        const arrowLen = 6 / zoom;
        const arrowX = wedgeLength * 0.8;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1.2 / zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(arrowX - arrowLen, -arrowLen * 0.5);
        ctx.lineTo(arrowX, 0);
        ctx.lineTo(arrowX - arrowLen, arrowLen * 0.5);
        ctx.stroke();

        ctx.restore();
      } else {
        // Standard HE Blast Radius (Red)
        const grad = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, blastRadiusPx);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
        grad.addColorStop(0.4, 'rgba(239, 68, 68, 0.35)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(targetX, targetY, blastRadiusPx, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
        ctx.stroke();
      }
    }

    // 4. Draw Max Gun Range
    const maxRangeMeters = calculateMaxRangeDiameter(
      projectile.velocity,
      studsToMeters(appState.gunHeight),
    );
    const maxRadiusPx = (metersToStuds(maxRangeMeters) / gameMap.size) * size;
    if (maxRadiusPx > 0 && maxRadiusPx < size * 3) {
      ctx.save();
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.beginPath();
      ctx.arc(gunX, gunY, maxRadiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Trajectory Line
    ctx.save();
    ctx.lineWidth = 2.5 / zoom;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(gunX, gunY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.restore();

    // 6. Draw Mid-Line Distance & Azimuth Badge
    const midX = (gunX + targetX) / 2;
    const midY = (gunY + targetY) / 2;
    drawInfoBadge(ctx, midX, midY, `${Math.round(appState.distanceMeters)}m | ${appState.azimuth.toFixed(1)}°`, zoom);

    // 7. Draw Gun Marker (Blue)
    // Make gun marker significantly smaller
    const gunMarkerRadius = Math.max(4, 7 / zoom);
    drawGunMarker(ctx, gunX, gunY, gunMarkerRadius, zoom, studsToMeters(appState.gunHeight));

    // 8. Draw Target Marker (Red)
    const targetMarkerRadius = Math.max(6, 10 / zoom);
    drawTargetMarker(ctx, targetX, targetY, targetMarkerRadius, zoom, studsToMeters(appState.targetHeight));

    ctx.restore();
    animationId = requestAnimationFrame(render);
  }

  function drawBackgroundGrid(c: CanvasRenderingContext2D, w: number, h: number) {
    const gridStep = 40;
    c.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < w; x += gridStep) {
      c.moveTo(x, 0);
      c.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridStep) {
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    c.stroke();
  }

  function drawGunMarker(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    zoom: number,
    heightM: number,
  ) {
    // Pulse ring
    c.fillStyle = 'rgba(59, 130, 246, 0.25)';
    c.beginPath();
    c.arc(x, y, r * 2, 0, Math.PI * 2);
    c.fill();

    // Core
    c.fillStyle = '#3b82f6';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    c.lineWidth = 2 / zoom;
    c.strokeStyle = '#ffffff';
    c.stroke();

    // Label
    c.save();
    const fontSize = Math.max(10, 12 / zoom);
    c.font = `bold ${fontSize}px system-ui, sans-serif`;
    c.fillStyle = '#93c5fd';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(0, 0, 0, 0.8)';
    c.shadowBlur = 4;
    c.fillText(`GUN (${heightM.toFixed(0)}m)`, x, y - r - 6 / zoom);
    c.restore();
  }

  function drawTargetMarker(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    zoom: number,
    heightM: number,
  ) {
    // Crosshair lines
    c.save();
    c.strokeStyle = '#ef4444';
    c.lineWidth = 2 / zoom;
    const len = r * 1.8;
    c.beginPath();
    c.moveTo(x - len, y);
    c.lineTo(x + len, y);
    c.moveTo(x, y - len);
    c.lineTo(x, y + len);
    c.stroke();

    // Target ring
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();

    // Center dot
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, y, r * 0.35, 0, Math.PI * 2);
    c.fill();

    // Label
    const fontSize = Math.max(10, 12 / zoom);
    c.font = `bold ${fontSize}px system-ui, sans-serif`;
    c.fillStyle = '#fca5a5';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(0, 0, 0, 0.8)';
    c.shadowBlur = 4;
    c.fillText(`TARGET (${heightM.toFixed(0)}m)`, x, y + r + fontSize + 4 / zoom);
    c.restore();
  }

  function drawInfoBadge(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    zoom: number,
  ) {
    c.save();
    const fontSize = Math.max(11, 13 / zoom);
    c.font = `600 ${fontSize}px monospace, system-ui`;
    const metrics = c.measureText(text);
    const padX = 8 / zoom;
    const padY = 4 / zoom;
    const bw = metrics.width + padX * 2;
    const bh = fontSize + padY * 2;

    c.fillStyle = 'rgba(15, 15, 20, 0.85)';
    c.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    c.lineWidth = 1 / zoom;

    c.beginPath();
    c.roundRect(x - bw / 2, y - bh / 2, bw, bh, 4 / zoom);
    c.fill();
    c.stroke();

    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
    c.restore();
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    hmCtx = hmCanvas.getContext('2d', { willReadFrequently: true });
    animationId = requestAnimationFrame(render);
  });

  onDestroy(() => {
    if (animationId) cancelAnimationFrame(animationId);
  });

  // Coordinate projection from screen to map normalized (0..1)
  function screenToNormalizedMap(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const cw = canvas.width;
    const ch = canvas.height;
    const size = baseMapSize;
    const zoom = appState.zoom;

    // Inverse of ctx.translate(cw/2 + panX, ch/2 + panY) -> ctx.scale(zoom) -> ctx.translate(-size/2, -size/2)
    const centeredX = screenX - (cw / 2 + panX);
    const centeredY = screenY - (ch / 2 + panY);

    const mapPxX = centeredX / zoom + size / 2;
    const mapPxY = centeredY / zoom + size / 2;

    return {
      x: Math.max(0, Math.min(1, mapPxX / size)),
      y: Math.max(0, Math.min(1, mapPxY / size)),
    };
  }

  // Mouse / Pointer handlers
  function handleMouseDown(e: MouseEvent) {
    // Suppress context menu on right click
    if (e.button === 2) {
      e.preventDefault();
    }

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (e.button === 1 || e.shiftKey || (e.button === 0 && e.altKey)) {
      // Middle click, Shift+Click, or Alt+Click -> Pan
      isPanning = true;
      return;
    }

    const { x, y } = screenToNormalizedMap(e.clientX, e.clientY);

    if (e.button === 0) {
      // Left Click -> Gun (or mobile mode)
      if (appState.mobileMode === 'target') {
        appState.setTarget(x, y);
        isDraggingTarget = true;
      } else {
        appState.setGun(x, y);
        isDraggingGun = true;
      }
    } else if (e.button === 2) {
      // Right Click -> Target
      appState.setTarget(x, y);
      isDraggingTarget = true;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (isPanning) {
      panX += e.clientX - lastMouseX;
      panY += e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      return;
    }

    if (isDraggingGun) {
      const { x, y } = screenToNormalizedMap(e.clientX, e.clientY);
      appState.setGun(x, y);
    } else if (isDraggingTarget) {
      const { x, y } = screenToNormalizedMap(e.clientX, e.clientY);
      appState.setTarget(x, y);
    }

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  function handleMouseUp() {
    isDraggingGun = false;
    isDraggingTarget = false;
    isPanning = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const cw = canvas.width;
    const ch = canvas.height;

    // Zoom multiplier
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.4, Math.min(25, appState.zoom * factor));
    const actualFactor = newZoom / appState.zoom;

    // Zoom centered towards mouse cursor
    panX = (panX - (mouseX - cw / 2)) * actualFactor + (mouseX - cw / 2);
    panY = (panY - (mouseY - ch / 2)) * actualFactor + (mouseY - ch / 2);

    appState.setZoom(newZoom);
  }

  function resetView() {
    panX = 0;
    panY = 0;
    appState.setZoom(1);
  }
</script>

<svelte:window
  onmousemove={handleMouseMove}
  onmouseup={handleMouseUp}
  oncontextmenu={(e) => {
    const path = e.composedPath();
    if (containerEl && path.includes(containerEl)) {
      e.preventDefault();
      return false;
    }
  }}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  role="application"
  class="relative w-full h-full bg-[#0e0e11] overflow-hidden select-none"
  oncontextmenu={(e) => e.preventDefault()}
>
  <canvas
    bind:this={canvas}
    class="w-full h-full block cursor-crosshair touch-none"
    onmousedown={handleMouseDown}
    onwheel={handleWheel}
    oncontextmenu={(e) => e.preventDefault()}
  ></canvas>

  <canvas bind:this={hmCanvas} class="hidden"></canvas>

  <!-- Quick Zoom / Reset Controls overlay in bottom-right -->
  <div class="absolute bottom-5 right-5 flex gap-2">
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-md text-xs font-bold font-mono border border-blue-500/30 shadow-lg backdrop-blur transition active:scale-95"
      onclick={toggle3DMode}
      title="Switch to 3D View"
    >
      3D
    </button>
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-mono border border-white/10 shadow-lg backdrop-blur transition active:scale-95"
      onclick={resetView}
      title="Fit map to screen"
    >
      Reset View (100%)
    </button>
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-mono border border-white/10 shadow-lg backdrop-blur transition active:scale-95"
      onclick={() => appState.setZoom(appState.zoom * 1.25)}
    >
      +
    </button>
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-mono border border-white/10 shadow-lg backdrop-blur transition active:scale-95"
      onclick={() => appState.setZoom(appState.zoom * 0.8)}
    >
      -
    </button>
  </div>
</div>
