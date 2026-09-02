<script lang="ts">
  import { appState } from '$lib/store.svelte';

  const [lowElev, highElev] = $derived(appState.elevation);
  const [lowTof, highTof] = $derived(appState.timeOfFlight);
  const isOutOfRange = $derived(lowElev === null && highElev === null);
</script>

<div class="bg-[#141418]/90 border border-white/10 rounded-xl p-4 shadow-2xl backdrop-blur-md text-white">
  <div class="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Firing Solution</h2>
    {#if isOutOfRange}
      <span class="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
        OUT OF RANGE
      </span>
    {:else}
      <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
        TARGET IN RANGE
      </span>
    {/if}
  </div>

  <!-- Primary Metrics: Elevation & Azimuth -->
  <div class="grid grid-cols-2 gap-3 mb-3">
    <!-- Elevation -->
    <div class="bg-black/30 border border-white/5 rounded-lg p-2.5">
      <div class="text-[11px] text-gray-400 uppercase font-medium">Elevation</div>
      {#if isOutOfRange}
        <div class="text-lg font-mono font-bold text-red-400 mt-1">---</div>
      {:else}
        <div class="mt-1 flex flex-col gap-0.5 font-mono">
          {#if lowElev !== null}
            <div class="flex items-baseline justify-between">
              <span class="text-[10px] text-gray-400 font-sans">LOW</span>
              <span class="text-base font-bold text-blue-400">{lowElev.toFixed(2)}°</span>
            </div>
          {/if}
          {#if highElev !== null}
            <div class="flex items-baseline justify-between border-t border-white/5 pt-0.5">
              <span class="text-[10px] text-gray-400 font-sans">HIGH</span>
              <span class="text-base font-bold text-indigo-300">{highElev.toFixed(2)}°</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Azimuth -->
    <div class="bg-black/30 border border-white/5 rounded-lg p-2.5 flex flex-col justify-between">
      <div class="text-[11px] text-gray-400 uppercase font-medium">Azimuth</div>
      <div class="text-xl font-mono font-bold text-emerald-400 mt-1">
        {appState.azimuth.toFixed(1)}°
      </div>
      <div class="text-[10px] text-gray-500 font-mono">
        Bearing 0-360°
      </div>
    </div>
  </div>

  <!-- Secondary Metrics: Distance, TOF, Altitude Delta -->
  <div class="space-y-2 text-xs font-mono">
    <!-- Distance -->
    <div class="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded border border-white/5">
      <span class="text-gray-400 font-sans">3D Distance:</span>
      <span class="font-bold text-white">
        {Math.round(appState.distanceMeters)} m
        <span class="text-gray-500 text-[10px]">({Math.round(appState.distanceStuds)} studs)</span>
      </span>
    </div>

    <!-- Time of Flight -->
    <div class="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded border border-white/5">
      <span class="text-gray-400 font-sans">Flight Time:</span>
      <span class="font-bold text-amber-300">
        {#if lowTof !== null && highTof !== null}
          {lowTof.toFixed(1)}s <span class="text-gray-500 text-[10px]">/ {highTof.toFixed(1)}s</span>
        {:else if lowTof !== null}
          {lowTof.toFixed(1)}s
        {:else}
          ---
        {/if}
      </span>
    </div>

    <!-- Elevation Delta -->
    {#if appState.currentMap.heightmap}
      <div class="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded border border-white/5">
        <span class="text-gray-400 font-sans">Height Diff (ΔH):</span>
        <span class="font-bold {appState.heightDifferenceMeters >= 0 ? 'text-blue-300' : 'text-orange-300'}">
          {appState.heightDifferenceMeters >= 0 ? '+' : ''}{appState.heightDifferenceMeters.toFixed(1)} m
        </span>
      </div>
    {/if}

    <!-- Cluster Submunitions Info -->
    {#if appState.currentProjectile.submunitions}
      <div class="flex items-center justify-between bg-amber-500/10 px-2.5 py-1.5 rounded border border-amber-500/20 text-amber-300">
        <span class="font-sans text-[11px]">Cluster Bomblets:</span>
        <span class="font-bold">
          {appState.currentProjectile.submunitions}x {#if appState.currentProjectile.explosiveMass}({appState.currentProjectile.explosiveMass}kg){/if}
        </span>
      </div>
    {/if}
  </div>
</div>
