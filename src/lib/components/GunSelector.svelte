<script lang="ts">
  import { appState } from '$lib/store.svelte';
  import { guns, type Gun, type Projectile } from '$lib/config/guns';

  let isOpen = $state(false);
  let searchQuery = $state('');

  const allGuns = Object.entries(guns);

  interface ShellVariant {
    index: number;
    projectile: Projectile;
    chargeLabel: string;
  }

  interface ShellGroup {
    baseName: string;
    isCluster: boolean;
    submunitions?: number;
    explosiveMass?: number;
    variants: ShellVariant[];
  }

  // Regex: capture everything before "Low/Medium/Med/High/Direct" optionally followed by " Charge", 
  // and optionally followed by a suffix like "PF"/"VT"
  const CHARGE_RE = /^(.*?)\s+(Low|Medium|Med|High|Direct)(?:\s+Charge)?\s*(.*?)$/i;

  function parseProjectileName(name: string): { baseName: string; chargeLabel: string } {
    const trimmed = name.trim();
    const m = trimmed.match(CHARGE_RE);
    if (m) {
      const prefix = m[1].trim();
      const charge = m[2].trim();
      const suffix = m[3].trim();

      let chargeLabel = charge;
      if (/^low$/i.test(charge)) chargeLabel = 'Low';
      else if (/^med(ium)?$/i.test(charge)) chargeLabel = 'Med';
      else if (/^high$/i.test(charge)) chargeLabel = 'High';
      else if (/^direct$/i.test(charge)) chargeLabel = 'Direct';

      const baseName = suffix ? `${prefix} ${suffix}` : prefix;
      return { baseName: baseName || trimmed, chargeLabel };
    }
    return { baseName: trimmed, chargeLabel: '' };
  }

  function groupGunProjectiles(gun: Gun): ShellGroup[] {
    const groupsMap = new Map<string, ShellGroup>();

    gun.projectiles.forEach((proj, index) => {
      const { baseName, chargeLabel } = parseProjectileName(proj.name);

      if (!groupsMap.has(baseName)) {
        groupsMap.set(baseName, {
          baseName,
          isCluster: false,
          submunitions: undefined,
          explosiveMass: undefined,
          variants: [],
        });
      }

      const group = groupsMap.get(baseName)!;
      group.variants.push({ index, projectile: proj, chargeLabel });
      if (proj.submunitions) {
        group.isCluster = true;
        group.submunitions = proj.submunitions;
      }
      if (proj.explosiveMass && !group.explosiveMass) {
        group.explosiveMass = proj.explosiveMass;
      }
    });

    return Array.from(groupsMap.values());
  }

  let filteredGuns = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allGuns;
    return allGuns.filter(
      ([, gun]) =>
        gun.name.toLowerCase().includes(q) ||
        gun.projectiles.some((p) => p.name.toLowerCase().includes(q)),
    );
  });

  function selectProjectile(gunKey: string, projectileIndex: number) {
    appState.setProjectile(gunKey, projectileIndex);
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') isOpen = false;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative w-full">
  <button
    class="w-full flex items-center justify-between gap-3 bg-[#18181c] hover:bg-[#222228] border border-white/10 hover:border-white/20 rounded-lg p-2.5 transition text-left text-white shadow-md active:scale-[0.99]"
    onclick={() => (isOpen = !isOpen)}
    type="button"
  >
    <div class="min-w-0 flex-1">
      <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold truncate">
        {appState.currentGun.name}
      </div>
      <div class="flex items-center gap-2 mt-0.5 flex-wrap">
        <span class="font-medium text-sm text-blue-400 truncate">
          {appState.currentProjectile.name}
        </span>
        <span class="text-xs bg-white/10 text-gray-300 font-mono px-1.5 py-0.5 rounded shrink-0">
          {appState.currentProjectile.velocity} m/s
        </span>
        {#if appState.currentProjectile.submunitions}
          <span class="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
            Cluster ({appState.currentProjectile.submunitions})
          </span>
        {/if}
      </div>
    </div>
    <svg class="w-4 h-4 text-gray-400 shrink-0 mr-1 transition-transform {isOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={() => (isOpen = false)}></div>

    <div class="absolute left-0 top-full mt-2 w-[360px] max-h-[480px] bg-[#141418] border border-white/15 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden backdrop-blur-xl">
      <div class="p-2.5 border-b border-white/10 bg-[#18181e]/80">
        <input
          type="text"
          placeholder="Search..."
          bind:value={searchQuery}
          class="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition font-sans"
        />
      </div>

      <div class="overflow-y-auto p-2 space-y-2 custom-scrollbar flex-1 max-h-[420px]">
        {#each filteredGuns as [gunKey, gun]}
          {@const shellGroups = groupGunProjectiles(gun)}
          <div class="bg-[#191920]/80 border border-white/5 rounded-lg px-2.5 py-2">
            <div class="text-[11px] font-semibold text-gray-300 pb-1.5 mb-1.5 border-b border-white/5 flex justify-between">
              <span>{gun.name}</span>
              <span class="text-gray-500 font-normal">{shellGroups.length}</span>
            </div>

            <div class="flex flex-col">
              {#each shellGroups as group, groupIdx}
                {#if groupIdx > 0}
                  <div class="border-t border-white/5 my-1"></div>
                {/if}

                {#if group.variants.length === 1}
                  <!-- Single shell: full-width clickable row -->
                  {@const variant = group.variants[0]}
                  {@const isSelected = appState.projectile.gunKey === gunKey && appState.projectile.index === variant.index}
                  <button
                    class="w-full flex items-center justify-between px-2 py-1.5 rounded transition text-left {isSelected
                      ? 'bg-blue-600/25 border border-blue-500/40 text-white'
                      : 'bg-white/[0.03] hover:bg-white/10 text-gray-300 border border-transparent'}"
                    onclick={() => selectProjectile(gunKey, variant.index)}
                    type="button"
                  >
                    <span class="text-[11px] font-medium truncate">
                      {group.baseName}
                      {#if group.isCluster}
                        <span class="text-[9px] text-amber-300 ml-0.5">⬡</span>
                      {/if}
                    </span>
                    <span class="text-[10px] font-mono {isSelected ? 'text-blue-200' : 'text-gray-500'} shrink-0 ml-2">
                      {variant.projectile.velocity} m/s
                    </span>
                  </button>
                {:else}
                  <!-- Multi-charge shell: name + horizontal charge pills -->
                  <div class="flex items-center gap-1.5 px-1 py-1 flex-wrap">
                    <span class="text-[11px] text-gray-300 font-medium shrink-0 min-w-[55px]">
                      {group.baseName}
                      {#if group.isCluster}
                        <span class="text-[9px] text-amber-300 ml-0.5">⬡</span>
                      {/if}
                    </span>

                    <div class="flex gap-0.5 flex-1 flex-wrap">
                      {#each group.variants as variant}
                        {@const isSelected = appState.projectile.gunKey === gunKey && appState.projectile.index === variant.index}
                        <button
                          class="px-2 py-0.5 rounded text-[10px] font-mono transition whitespace-nowrap {isSelected
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white'}"
                          onclick={() => selectProjectile(gunKey, variant.index)}
                          type="button"
                          title="{variant.projectile.name} — {variant.projectile.velocity} m/s"
                        >
                          {#if variant.chargeLabel}
                            {variant.chargeLabel}
                          {:else}
                            {variant.projectile.name}
                          {/if}
                          <span class="text-[9px] {isSelected ? 'text-blue-200' : 'text-gray-500'} ml-0.5">{variant.projectile.velocity}</span>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}

        {#if filteredGuns.length === 0}
          <div class="text-center py-6 text-sm text-gray-400">No results for "{searchQuery}"</div>
        {/if}
      </div>
    </div>
  {/if}
</div>
