<script lang="ts">
  import { appState } from '$lib/store.svelte';
  import { gameMaps, type MapId } from '$lib/config/maps';
  import { getMapImageUrl } from '$lib/utils/images';

  let isOpen = $state(false);
  let searchQuery = $state('');

  const allMapEntries = Object.entries(gameMaps) as [MapId, (typeof gameMaps)[MapId]][];

  let filteredMaps = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allMapEntries;
    return allMapEntries.filter(([, map]) => map.name.toLowerCase().includes(q));
  });

  let inRotationMaps = $derived(filteredMaps.filter(([, map]) => map.inRotation));
  let otherMaps = $derived(filteredMaps.filter(([, map]) => !map.inRotation));

  function selectMap(id: MapId) {
    appState.setMap(id);
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') isOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative w-full">
  <!-- Trigger Button with current map thumbnail -->
  <button
    class="w-full flex items-center justify-between gap-3 bg-[#18181c] hover:bg-[#222228] border border-white/10 hover:border-white/20 rounded-lg p-2 transition text-left text-white shadow-md active:scale-[0.99]"
    onclick={() => (isOpen = !isOpen)}
    type="button"
  >
    <div class="flex items-center gap-3 min-w-0">
      <img
        src={getMapImageUrl(appState.currentMap.image, { width: 48, q: 90 })}
        alt={appState.currentMap.name}
        class="w-10 h-10 rounded-md object-cover bg-black/50 border border-white/10 shrink-0"
      />
      <div class="min-w-0">
        <div class="font-medium text-sm text-gray-100 truncate">
          {appState.currentMap.name}
        </div>
        <div class="text-xs text-gray-400 font-mono">
          {Math.round(appState.currentMap.size)} studs
        </div>
      </div>
    </div>

    <svg class="w-4 h-4 text-gray-400 shrink-0 mr-1 transition-transform {isOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Modal / Dropdown overlay -->
  {#if isOpen}
    <!-- Backdrop for click outside -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={() => (isOpen = false)}></div>

    <div class="absolute left-0 top-full mt-2 w-80 md:w-96 max-h-[460px] bg-[#141418] border border-white/15 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden backdrop-blur-xl">
      <!-- Search header -->
      <div class="p-3 border-b border-white/10 bg-[#18181e]/80">
        <div class="relative">
          <input
            type="text"
            placeholder="Search map..."
            bind:value={searchQuery}
            class="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition font-sans"
          />
          {#if searchQuery}
            <button
              class="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-white"
              onclick={() => (searchQuery = '')}
            >✕</button>
          {/if}
        </div>
      </div>

      <!-- Map List with thumbnails -->
      <div class="overflow-y-auto p-2 space-y-3 custom-scrollbar flex-1 max-h-[380px]">
        {#if inRotationMaps.length > 0}
          <div>
            <div class="px-2 py-1 text-[11px] font-semibold tracking-wider text-blue-400/90 uppercase">
              In Rotation ({inRotationMaps.length})
            </div>
            <div class="grid grid-cols-1 gap-1 mt-1">
              {#each inRotationMaps as [id, map]}
                {@render mapItem(id, map)}
              {/each}
            </div>
          </div>
        {/if}

        {#if otherMaps.length > 0}
          <div>
            <div class="px-2 py-1 text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
              Other Maps ({otherMaps.length})
            </div>
            <div class="grid grid-cols-1 gap-1 mt-1">
              {#each otherMaps as [id, map]}
                {@render mapItem(id, map)}
              {/each}
            </div>
          </div>
        {/if}

        {#if filteredMaps.length === 0}
          <div class="text-center py-6 text-sm text-gray-400">
            No maps found for "{searchQuery}"
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet mapItem(id: MapId, map: (typeof gameMaps)[MapId])}
  <button
    class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition {appState.mapId === id ? 'bg-blue-600/20 border border-blue-500/40 text-white' : 'hover:bg-white/5 text-gray-200 border border-transparent'}"
    onclick={() => selectMap(id)}
    type="button"
  >
    <img
      src={getMapImageUrl(map.image, { width: 48, q: 90 })}
      alt={map.name}
      loading="lazy"
      class="w-11 h-11 rounded-md object-cover bg-black/60 border border-white/10 shrink-0"
    />
    <div class="min-w-0 flex-1">
      <div class="font-medium text-sm">
        <span class="truncate">{map.name}</span>
      </div>
      <div class="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
        <span>Size: {Math.round(map.size)}</span>
        {#if map.inRotation}
          <span class="text-[10px] text-emerald-400 font-medium">• Active</span>
        {/if}
      </div>
    </div>

    {#if appState.mapId === id}
      <span class="text-blue-400 text-sm font-bold shrink-0">✓</span>
    {/if}
  </button>
{/snippet}
