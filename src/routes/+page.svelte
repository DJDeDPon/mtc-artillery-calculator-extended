<script lang="ts">
  import CanvasMap from '$lib/components/CanvasMap.svelte';
  import MapSelector from '$lib/components/MapSelector.svelte';
  import GunSelector from '$lib/components/GunSelector.svelte';
  import SolutionPanel from '$lib/components/SolutionPanel.svelte';

  import Map3D from '$lib/components/Map3D.svelte';

  let isSidebarCollapsed = $state(false);
  let is3DMode = $state(false);

  let map3DRef: any = $state();
  let canvasMapRef: any = $state();

  function toggle3DMode() {
    is3DMode = !is3DMode;
  }
</script>

<div class="app-viewport relative">
  <!-- Interactive Map -->
  {#if is3DMode}
    <Map3D bind:this={map3DRef} {toggle3DMode} />
  {:else}
    <CanvasMap bind:this={canvasMapRef} {toggle3DMode} />
  {/if}

  <!-- Floating Graphite Control Sidebar -->
  <aside class="floating-sidebar">
    <!-- Main Card -->
    <div class="relative z-20 bg-[#141418]/90 border border-white/10 rounded-xl p-4 shadow-2xl backdrop-blur-md text-white flex flex-col gap-3.5">
      <div class="flex items-center justify-end">
        <button
          class="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-white/10 transition"
          onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)}
          title={isSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isSidebarCollapsed ? '▼ Show' : '▲ Hide'}
        </button>
      </div>

      {#if !isSidebarCollapsed}
        <!-- Map Selection with preview -->
        <div>
          <span class="block text-[11px] uppercase font-semibold text-gray-400 mb-1.5">
            Select Map
          </span>
          <MapSelector />
        </div>

        <!-- Gun & Shell Selection -->
        <div>
          <span class="block text-[11px] uppercase font-semibold text-gray-400 mb-1.5">
            Vehicle & Shell
          </span>
          <GunSelector />
        </div>
      {/if}
    </div>

    <!-- Firing Solution Results Panel -->
    <SolutionPanel />

    <!-- Instructions Pill -->
    <div class="bg-[#141418]/80 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-400 backdrop-blur-sm shadow-md font-mono flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <span class="text-blue-400 font-bold">LMB Drag:</span>
        <span class="text-gray-300">Set Gun Position</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-red-400 font-bold">RMB Drag:</span>
        <span class="text-gray-300">Set Target Position</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-400 font-bold">MMB / Scroll:</span>
        <span class="text-gray-300">Pan & Zoom</span>
      </div>
    </div>
  </aside>

  <!-- Attribution links in bottom-left corner -->
  <div class="fixed bottom-3.5 left-4 z-40 flex items-center gap-2">
    <a
      href="https://github.com/grand-hawk/artillery-calculator"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-[#141418]/80 hover:bg-[#141418] border border-white/10 rounded-md px-2.5 py-1 backdrop-blur-sm shadow"
      title="Original repository by Astrid (grand-hawk)"
    >
      <span>Original</span>
      <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    </a>

    <a
      href="https://github.com/DJDeDPon/mtc-artillery-calculator-extended"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-[#141418]/80 hover:bg-[#141418] border border-white/10 rounded-md px-2.5 py-1 backdrop-blur-sm shadow"
      title="Extended repository by DJDeDPon"
    >
      <span>Mine</span>
      <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    </a>
  </div>
</div>
