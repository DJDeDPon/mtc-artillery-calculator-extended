<script lang="ts">
	import './layout.css';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>MTC Artillery Calculator</title>

	<meta
		name="description"
		content="Artillery Calculator for Roblox military games with ballistic elevation calculations and interactive 3D map."
	/>
</svelte:head>

{@render children()}
