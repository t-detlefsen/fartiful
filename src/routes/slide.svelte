<script>
	import { createEventDispatcher } from 'svelte';

	export let slideNo;
	export let totalSlides;
	export let image;
	export let attribute;
	export let altTag = 'Event photo';
	export let canDelete = false;

	const dispatch = createEventDispatcher();

	let imageLoadError = false;

	// Reset the error when navigating to another image.
	$: if (image) {
		imageLoadError = false;
	}
</script>

<div class="space-y-3">
	<div
		class="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-sm border border-white/20 bg-black/30 shadow-lg sm:aspect-[4/3]"
	>
		{#if imageLoadError}
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-violet-300"
			role="status"
			aria-live="polite"
		>
			<svg
				class="h-10 w-10 text-violet-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v4m0 4h.01M10.29 3.86l-7.82 13.5A2 2 0 004.2 20.36h15.6a2 2 0 001.73-3L13.71 3.86a2 2 0 00-3.42 0z"
				/>
			</svg>

			<p>Unable to load this photo.</p>
		</div>
	{:else}
		<img
			src={image}
			alt={altTag}
			class="h-full w-full object-contain"
			draggable="false"
			on:error={() => (imageLoadError = true)}
		/>
	{/if}


		{#if canDelete}
			<button
				type="button"
				title="Delete current image"
				aria-label="Delete current image"
				class="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-sm border border-red-400/60 bg-slate-950/75 text-red-300 transition hover:bg-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-400"
				on:click={() => dispatch('deleteClick')}
			>
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 01-1-1h-4a1 1 0 01-1 1v3M4 7h16"
					/>
				</svg>
			</button>
		{/if}

		<button
			type="button"
			aria-label="Previous image"
			class="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm border border-violet-400/50 bg-slate-950/70 text-2xl text-white transition hover:bg-violet-500/70"
			on:click={() => dispatch('prevClick')}
		>
			‹
		</button>

		<button
			type="button"
			aria-label="Next image"
			class="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm border border-violet-400/50 bg-slate-950/70 text-2xl text-white transition hover:bg-violet-500/70"
			on:click={() => dispatch('nextClick')}
		>
			›
		</button>
	</div>

	<div class="text-center text-sm text-violet-300">
		{slideNo + 1} / {totalSlides}
	</div>

	{#if attribute !== ''}
	<div class="text-center text-sm text-violet-300">
		Credit: {attribute}
	</div>
	{/if}
</div>
