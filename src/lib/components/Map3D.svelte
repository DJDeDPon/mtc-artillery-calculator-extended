<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { appState } from '$lib/store.svelte';
  import { getMapImageUrl, getHeightmapImageUrl } from '$lib/utils/images';
  import {
    calculateHighElevation,
    calculateLowElevation,
    calculateMaxRangeDiameter,
    metersToStuds,
    studsToMeters,
  } from '$lib/utils/math';
  import { applySmoothHeightmapToMesh, drawLetterboxedHeightmap } from '$lib/utils/heightmap3d';

  let containerEl: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let animationId: number;

  let terrainMesh: THREE.Mesh | null = null;
  let gunMarker: THREE.Mesh | null = null;
  let targetMarker: THREE.Mesh | null = null;
  let trajectoryLines: THREE.Line[] = [];
  let rangeCircleLine: THREE.LineLoop | null = null;

  let terrainHeightLookup: ((wx: number, wz: number) => number) | null = null;
  let hmRawData: Uint8ClampedArray | null = null;
  let hmWidth = 0;
  let hmHeight = 0;

  let viewLocked = $state(true);

  const G = 9.8 * 1.8; // Game gravity

  let currentMapId = '';

  function syncHeights() {
    if (!hmRawData || !appState.currentMap.heightmap) return;
    const { 0: minHeight, 255: maxHeight } = appState.currentMap.heightmap;
    
    const gx = Math.max(0, Math.min(hmWidth - 1, Math.round(appState.gun.x * (hmWidth - 1))));
    const gy = Math.max(0, Math.min(hmHeight - 1, Math.round(appState.gun.y * (hmHeight - 1))));
    const gPixel = hmRawData[(gy * hmWidth + gx) * 4];
    const gunH = minHeight + (gPixel / 255) * (maxHeight - minHeight);

    const tx = Math.max(0, Math.min(hmWidth - 1, Math.round(appState.target.x * (hmWidth - 1))));
    const ty = Math.max(0, Math.min(hmHeight - 1, Math.round(appState.target.y * (hmHeight - 1))));
    const tPixel = hmRawData[(ty * hmWidth + tx) * 4];
    const targetH = minHeight + (tPixel / 255) * (maxHeight - minHeight);

    appState.setHeights(gunH, targetH);
  }
  
  $effect(() => {
    // Re-render when dependencies change
    if (appState.currentMap.name !== currentMapId) {
      currentMapId = appState.currentMap.name;
      terrainHeightLookup = null;
      hmRawData = null;
      buildTerrain();
    }
    appState.gun;
    appState.target;
    appState.projectile;
    appState.elevation;
    syncHeights();
    updateScene();
  });

  onMount(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#161922'); // Soft atmospheric slate navy instead of pitch black void
    scene.fog = new THREE.FogExp2('#161922', 0.000035);

    camera = new THREE.PerspectiveCamera(60, containerEl.clientWidth / containerEl.clientHeight, 1, 50000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.45;
    containerEl.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground

    // 1. High ambient illumination: ensures all polygons get bright, clear base light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    // 2. Natural sky/ground bounce light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x889aa8, 0.95);
    scene.add(hemiLight);

    // 3. Main Key Sunlight: Crisp, bright directional lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(2000, 4000, 1500);
    scene.add(sunLight);

    // 4. Opposing Fill Light: Softens harsh dark shadows on reverse slopes
    const fillLight = new THREE.DirectionalLight(0xccddff, 0.75);
    fillLight.position.set(-2000, 3000, -1500);
    scene.add(fillLight);

    // Initial setup
    currentMapId = appState.currentMap.name;
    buildTerrain();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDragging = false;
    let dragButton = -1;

    const handlePointerRaycast = (clientX: number, clientY: number, button: number) => {
      if (viewLocked || !terrainMesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(terrainMesh);
      if (intersects.length > 0) {
        const p = intersects[0].point;
        const size = appState.currentMap.size;
        const nx = Math.max(0, Math.min(1, p.x / size + 0.5));
        const ny = Math.max(0, Math.min(1, p.z / size + 0.5));
        
        if (button === 0) {
          appState.setGun(nx, ny);
        } else if (button === 2) {
          appState.setTarget(nx, ny);
        }
        syncHeights();
        updateScene();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (viewLocked) return;
      if (e.button === 0 || e.button === 2) {
        isDragging = true;
        dragButton = e.button;
        handlePointerRaycast(e.clientX, e.clientY, dragButton);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || viewLocked) return;
      handlePointerRaycast(e.clientX, e.clientY, dragButton);
    };

    const onPointerUp = () => {
      isDragging = false;
      dragButton = -1;
    };
    
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Resize handler
    const onResize = () => {
      camera.aspect = containerEl.clientWidth / containerEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.enabled = viewLocked;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      containerEl.removeChild(renderer.domElement);
    };
  });

  function buildTerrain() {
    if (!scene) return;
    
    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      (terrainMesh.material as THREE.Material).dispose();
    }

    const currentMap = appState.currentMap;
    const size = currentMap.size;
    const textureLoader = new THREE.TextureLoader();
    
    // 512x512 with bicubic sub-pixel sampling produces silky smooth terrain
    const segments = 512;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Pure white for full texture vibrance
      roughness: 0.45,
      metalness: 0.0,
      wireframe: false
    });

    textureLoader.load(getMapImageUrl(currentMap.image, { q: 90 }), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      material.map = tex;
      material.needsUpdate = true;
    });

    terrainMesh = new THREE.Mesh(geometry, material);
    scene.add(terrainMesh);

    if (currentMap.heightmap) {
      const { 0: minHeight, 255: maxHeight } = currentMap.heightmap;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = getHeightmapImageUrl(currentMap.image);
      img.onload = () => {
        // Cache raw image data with letterbox alignment for exact height calculation sync
        const hmCanvasRes = Math.max(img.width, img.height);
        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = hmCanvasRes;
        rawCanvas.height = hmCanvasRes;
        const rawCtx = rawCanvas.getContext('2d')!;
        drawLetterboxedHeightmap(rawCtx, img, hmCanvasRes, hmCanvasRes);
        hmRawData = rawCtx.getImageData(0, 0, hmCanvasRes, hmCanvasRes).data;
        hmWidth = hmCanvasRes;
        hmHeight = hmCanvasRes;

        // Apply fast 3D smoothing pipeline and get continuous world height lookup
        const { getHeightAtWorld } = applySmoothHeightmapToMesh(
          geometry,
          img,
          minHeight,
          maxHeight,
          segments,
          size
        );
        terrainHeightLookup = getHeightAtWorld;

        syncHeights();
        updateScene();
      };
    }

    // Set camera position based on map size
    camera.position.set(0, size * 0.8, size * 0.8);
    controls.target.set(0, 0, 0);
    controls.update();

    updateScene();
  }

  function updateScene() {
    if (!scene || !terrainMesh) return;

    const size = appState.currentMap.size;
    
    const gunX = (appState.gun.x - 0.5) * size;
    const gunZ = (appState.gun.y - 0.5) * size;
    const targetX = (appState.target.x - 0.5) * size;
    const targetZ = (appState.target.y - 0.5) * size;

    // Direct terrain surface height binding!
    const gunGroundY = terrainHeightLookup ? terrainHeightLookup(gunX, gunZ) : appState.gunHeight;
    const targetGroundY = terrainHeightLookup ? terrainHeightLookup(targetX, targetZ) : appState.targetHeight;

    // Update markers
    if (!gunMarker) {
      // Tank-like box (approx 4m x 3m x 8m -> ~7 x 5 x 14 studs)
      const gGeo = new THREE.BoxGeometry(10, 8, 15);
      const gMat = new THREE.MeshStandardMaterial({ 
        color: 0x3b82f6,
        roughness: 0.25,
        metalness: 0.1
      }); // Blue
      gunMarker = new THREE.Mesh(gGeo, gMat);
      scene.add(gunMarker);
    }
    // Sit gun box cleanly on top of terrain surface (half-height = 4)
    gunMarker.position.set(gunX, gunGroundY + 4, gunZ);

    if (!targetMarker) {
      // Distinct target marker: Tetrahedron (pyramid-like)
      const tGeo = new THREE.TetrahedronGeometry(12);
      const tMat = new THREE.MeshStandardMaterial({ 
        color: 0xef4444,
        roughness: 0.25,
        metalness: 0.1
      }); // Red
      targetMarker = new THREE.Mesh(tGeo, tMat);
      scene.add(targetMarker);
    }
    // Sit target pyramid cleanly on top of terrain surface (half-height = 4.5)
    targetMarker.position.set(targetX, targetGroundY + 4.5, targetZ);
    targetMarker.rotation.x = Math.PI / 4;
    targetMarker.rotation.z = Math.PI / 4;

    // Clear old trajectories
    trajectoryLines.forEach(l => {
      scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
    trajectoryLines = [];

    // Clear old range circle
    if (rangeCircleLine) {
      scene.remove(rangeCircleLine);
      rangeCircleLine.geometry.dispose();
      (rangeCircleLine.material as THREE.Material).dispose();
      rangeCircleLine = null;
    }

    // Draw trajectories and range circle
    const proj = appState.currentProjectile;
    
    if (proj) {
      // 1. Draw Max Gun Range Ring (conforming smoothly to 3D terrain)
      const maxRangeMeters = calculateMaxRangeDiameter(
        proj.velocity,
        studsToMeters(gunGroundY)
      );
      const maxRangeStuds = metersToStuds(maxRangeMeters);

      if (maxRangeStuds > 0 && maxRangeStuds < size * 4) {
        const ringSegments = 240;
        const ringPoints = [];
        for (let i = 0; i <= ringSegments; i++) {
          const theta = (i / ringSegments) * Math.PI * 2;
          const rx = gunX + maxRangeStuds * Math.cos(theta);
          const rz = gunZ + maxRangeStuds * Math.sin(theta);
          const ry = terrainHeightLookup ? terrainHeightLookup(rx, rz) : 0;
          ringPoints.push(new THREE.Vector3(rx, ry + 2.5, rz));
        }
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
        const ringMat = new THREE.LineDashedMaterial({
          color: 0x3b82f6, // Tactical Blue
          dashSize: 30,
          gapSize: 20,
          linewidth: 2,
          transparent: true,
          opacity: 0.75,
          depthWrite: false
        });
        rangeCircleLine = new THREE.LineLoop(ringGeo, ringMat);
        rangeCircleLine.computeLineDistances();
        scene.add(rangeCircleLine);
      }

      // 2. Trajectories
      const v0 = proj.velocity; // m/s
      const dx = targetX - gunX;
      const dz = targetZ - gunZ;
      const distStuds = Math.sqrt(dx * dx + dz * dz);
      const distMeters = studsToMeters(distStuds);

      // Exact physical start and end in the 3D world
      const startY = gunGroundY + 4;
      const endY = targetGroundY + 4.5;
      
      // Height difference between target marker and gun marker in meters
      const diffMeters = studsToMeters(endY - startY);

      // Compute exact 3D trajectory angles to hit the target marker
      const lowAngle = calculateLowElevation(distMeters, v0, diffMeters);
      const highAngle = calculateHighElevation(distMeters, v0, diffMeters);

      const drawTrajectory = (elevDeg: number, isHigh: boolean) => {
        const elevRad = (elevDeg * Math.PI) / 180;
        const vH = v0 * Math.cos(elevRad);
        const vV = v0 * Math.sin(elevRad);
        
        const tTotal = distMeters / vH;
        const steps = 120;
        
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps; // 0 to 1
          const t = progress * tTotal;
          
          const px = gunX + dx * progress;
          const pz = gunZ + dz * progress;
          
          // Ballistic trajectory: y(t) = y0 + vV*t - 0.5*G*t^2
          const hMeters = vV * t - 0.5 * G * t * t;
          const py = startY + metersToStuds(hMeters);
          
          points.push(new THREE.Vector3(px, py, pz));
        }
        
        if (points.length > 1) {
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          let lineMat;
          if (isHigh) {
            lineMat = new THREE.LineDashedMaterial({ 
              color: 0x900020, // Burgundy
              linewidth: 2,
              dashSize: 20,
              gapSize: 15,
              transparent: true,
              opacity: 0.95
            });
          } else {
            lineMat = new THREE.LineBasicMaterial({ 
              color: 0x3b82f6, // Blue
              linewidth: 2,
              transparent: true,
              opacity: 0.95
            });
          }
          const line = new THREE.Line(lineGeo, lineMat);
          if (isHigh) line.computeLineDistances();
          scene.add(line);
          trajectoryLines.push(line);
        }
      };

      if (Number.isFinite(lowAngle) && !Number.isNaN(lowAngle)) {
        drawTrajectory(lowAngle, false);
      }
      if (Number.isFinite(highAngle) && !Number.isNaN(highAngle)) {
        drawTrajectory(highAngle, true);
      }
    }
  }

  // Allow resetting view to gun
  export function resetView() {
    if (controls && appState.currentMap) {
      const size = appState.currentMap.size;
      const gunX = (appState.gun.x - 0.5) * size;
      const gunZ = (appState.gun.y - 0.5) * size;
      const gunY = terrainHeightLookup ? terrainHeightLookup(gunX, gunZ) : appState.gunHeight;
      
      controls.target.set(gunX, gunY, gunZ);
      camera.position.set(gunX + size*0.1, gunY + size*0.1, gunZ + size*0.1);
      controls.update();
    }
  }

  let { toggle3DMode }: { toggle3DMode: () => void } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  class="relative w-full h-full bg-[#0e0e11] select-none" 
  role="application"
  oncontextmenu={(e) => {
    // Prevent context menu in 3D view if unlocked (so RMB can be used to set target)
    if (!viewLocked) e.preventDefault();
  }}
>
  <div bind:this={containerEl} class="w-full h-full"></div>

  <!-- Quick Controls overlay in bottom-right -->
  <div class="absolute bottom-5 right-5 flex gap-2">
    <button
      class={`px-3 py-1.5 rounded-md text-xs font-bold font-mono border shadow-lg backdrop-blur transition active:scale-95 flex items-center gap-1.5 ${
        viewLocked 
          ? 'bg-[#18181c]/90 hover:bg-[#25252b] text-gray-300 hover:text-white border-white/10' 
          : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/50'
      }`}
      onclick={() => (viewLocked = !viewLocked)}
      title="Toggle camera lock to place markers"
    >
      {viewLocked ? '🔒 Camera Locked' : '🔓 Click to Place'}
    </button>
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-md text-xs font-bold font-mono border border-blue-500/30 shadow-lg backdrop-blur transition active:scale-95"
      onclick={toggle3DMode}
      title="Switch to 2D View"
    >
      2D
    </button>
    <button
      class="bg-[#18181c]/90 hover:bg-[#25252b] text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-mono border border-white/10 shadow-lg backdrop-blur transition active:scale-95"
      onclick={resetView}
      title="Fit map to screen"
    >
      Reset View
    </button>
  </div>
</div>
