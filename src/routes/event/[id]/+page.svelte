<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import type { Event, RSVP, Media} from '$lib/types';
	import { RSVPStatus } from '$lib/types';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { formatTime, formatDate, formatStatus, confirmedLength } from '$lib/dateHelpers.js';
	import CalendarModal from '$lib/components/CalendarModal.svelte';
	import type { CalendarEvent } from '$lib/calendarHelpers.js';
	import { t } from '$lib/i18n/i18n.js';
	import { sql } from 'drizzle-orm';
	import { images } from '../../imageData.js'; // TODO: Remove
	import Slide from '../../slide.svelte'; // TODO: Fix path

	export let data: { event: Event; rsvps: RSVP[]; media: Media[]; userId: string };
	type FormDataLocal = { success?: boolean; error?: string; type?: 'add' | 'remove' | 'copy' };
	export let form: FormDataLocal | undefined;

	let event: Event;
	let rsvps: RSVP[] = [];
	let media: Media[] = [];
	let newAttendeeName = '';
	let newAttendeeStatus = RSVPStatus.yes;
	let isAddingRSVP = false;
	let error = '';
	let success = ''; // TODO: change to boolean and refactor with 482-506
	let addGuests = false;
	let numberOfGuests = 1;
	let showCalendarModal = false;
	let calendarEvent: CalendarEvent;
	let toastType: 'add' | 'remove' | 'copy' | null = null;
	let typeToShow: 'add' | 'remove' | 'copy' | undefined;
	let successHideTimer: number | null = null;

	// TODO: Setup Images
	let imageShowingIndex = 0;
	$: console.log(imageShowingIndex);
	$: image = images[imageShowingIndex];

	// Use server-side data
	$: event = data.event;
	$: rsvps = data.rsvps;
	$: media = data.media;
	$: currentUserId = data.userId;
	$: isEventCreator = event.user_id === currentUserId;

	// Create calendar event object when event data changes
	$: if (event && browser) {
		calendarEvent = {
			name: event.name,
			date: event.date,
			time: event.time,
			location: event.location,
			url: `${$page.url.origin}/event/${eventId}`
		};
	}

	// Handle form errors from server
	$: if (form?.error) {
		error = String(form.error);
		success = '';
	}

	const handleFormSuccess = () => {
		if (form?.type === 'add') {
			success = 'RSVP added successfully! '
		} else {
			success = 'RSVP removed successfully.';
		}

		error = '';
		newAttendeeName = '';
		newAttendeeStatus = RSVPStatus.yes;
		addGuests = false;
		numberOfGuests = 1;

		toastType = form?.type || 'add';

		if (browser) {
			if (successHideTimer) clearTimeout(successHideTimer);
			successHideTimer = window.setTimeout(() => {
				success = '';
				toastType = null;
			}, 3000);
		}
	};

	// Handle form success from server
	$: if (form?.success) handleFormSuccess();

	// Derive toast type from local or server form
	$: typeToShow = toastType ?? form?.type;

	const eventId = $page.params.id || '';

	const copyEventLink = () => {
		if (browser && isEventCreator) {
			const url = `${$page.url.origin}/event/${eventId}`;
			navigator.clipboard.writeText(url).then(() => {
				toastType = 'copy';
				success = t('event.eventLinkCopied');

				setTimeout(() => {
					success = '';
					toastType = null;
				}, 3000);
			});
		}
	};

	const clearMessages = () => {
		error = '';
		success = '';
		toastType = null;
	};

	// Calendar modal functions
	const openCalendarModal = () => {
		showCalendarModal = true;
	};

	const closeCalendarModal = () => {
		showCalendarModal = false;
	};

	const nextSlide = () => {
		if (imageShowingIndex === media.length-1) {
			imageShowingIndex = 0;
		} else {
			imageShowingIndex += 1;
		}
	}
	
	const prevSlide = () => {
		if (imageShowingIndex === 0) {
			imageShowingIndex = media.length-1;
		} else {
			imageShowingIndex -= 1;
		}
	}

	let uploadInput;
	let selectedFiles = [];

	function handleFileSelection(event) {
		selectedFiles = Array.from(event.currentTarget.files || []);
	}

	function clearSelectedFiles() {
		selectedFiles = [];

		if (uploadInput) {
			uploadInput.value = '';
		}
	}

	$: currentMedia = media[imageShowingIndex];

	$: currentMediaAttribute = (() => {
		if (!currentMedia) return '';

		// Prefer the attendee's primary RSVP over a guest entry.
		const attendee =
			rsvps.find(
				(attendee) =>
					attendee.user_id === currentMedia.user_id &&
					!attendee.name.includes("'s Guest")
			) ??
			rsvps.find((attendee) => attendee.user_id === currentMedia.user_id);

		return attendee?.name ?? '';
	})();

	$: isConfirmedAttendee = rsvps.some(
		(attendee) =>
			attendee.user_id === currentUserId &&
			attendee.status === RSVPStatus.yes
	);

	$: canUploadMedia = isEventCreator || isConfirmedAttendee;

	$: isMediaAttribute = (currentMedia.user_id === currentUserId);

	$: canDeleteCurrentImage = isMediaAttribute || isEventCreator;
</script>

<svelte:head>
	<title>{event?.name || t('event.eventTitle')}</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Main Content -->
	<div class="container mx-auto flex-1 px-4 py-6">
		{#if error && !event}
			<!-- Error State -->
			<div class="mx-auto max-w-md text-center">
				<div class="rounded-sm border border-red-500/30 bg-red-900/20 p-8">
					<div class="mb-4 text-6xl text-red-400">⚠️</div>
					<h2 class="mb-4 text-2xl font-bold text-red-400">{t('event.eventNotFoundTitle')}</h2>
					<p class="my-8">{t('event.eventNotFoundDescription')}</p>
					<button
						on:click={() => goto('/create')}
						class="border-white-500 bg-white-400/20 mt-2 rounded-sm border px-6 py-3 font-semibold text-white duration-400 hover:scale-110 hover:bg-white/10"
					>
						{t('common.createNewEvent')}
					</button>
				</div>
			</div>
		{:else if event}
			<div class="mx-auto max-w-2xl space-y-6">
				<!-- Event Details Card -->

				<div class="rounded-sm border p-6 shadow-2xl">
					<h2 class=" mb-4 text-center text-2xl font-bold">
						{event.name}
					</h2>

					<div class="space-y-4">
						
						<!-- Event Description -->
						{#if event.description != 'none'}
							<div class="text-center break-all">
								<p class="text-xs text-white">
									{event.description}
								</p>
							</div>
						{/if}

						<!-- Date & Time -->
						<div class="flex items-center space-x-3 text-violet-400">
							<div class="flex h-8 w-8 items-center justify-center rounded-sm">
								<svg class=" h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
									></path>
								</svg>
							</div>
							<div>
								<p class="font-semibold text-white">
									{formatDate(event.date)}
									<span class="font-medium text-violet-400">-</span>
									{formatTime(event.time)}
								</p>
							</div>
						</div>

						<!-- Location (only show when not 'none') -->
						<div class="flex items-center space-x-3 text-violet-400">
							<div class="flex h-8 w-8 items-center justify-center rounded-sm">
								<svg class=" h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
									></path>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
									></path>
								</svg>
							</div>
							<div>
								{#if event.location_type === 'none'}
									<p class="font-semibold text-white">N/A</p>
								{:else if event.location_type === 'maps' && event.location_url}
									<a
										href={event.location_url}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-white transition-colors duration-200 hover:text-violet-300"
									>
										{t('create.locationMapsOption')}
									</a>
								{:else}
									<p class="font-semibold text-white">{event.location}</p>
								{/if}
							</div>
						</div>

						<!-- Event Type, Visibility & Capacity -->
						<div class="flex items-center justify-between rounded-sm p-3">
							<div class="flex items-center space-x-2">
								<span
									class="rounded-sm border px-2 py-1 text-xs font-medium {event.type === 'limited'
										? 'border-amber-600 text-amber-600'
										: 'border-teal-500 text-teal-500'}"
								>
									{event.type === 'limited' ? t('common.limited') : t('common.unlimited')}
								</span>
								<span
									class="rounded-sm border px-2 py-1 text-xs font-medium {event.visibility ===
									'public'
										? 'border-green-300 text-green-400'
										: 'border-orange-300 text-orange-400'}"
								>
									{event.visibility === 'public' ? t('common.public') : t('common.private')}
								</span>
							</div>

							{#if event.type === 'limited' && event.attendee_limit}
								<div class="text-right">
									<p class="text-sm">{t('common.capacity')}</p>
									<p class=" text-lg font-bold">
										{confirmedLength(rsvps)}/{event.attendee_limit}
									</p>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- RSVP Form -->
				<div class=" rounded-sm border p-6 shadow-2xl backdrop-blur-sm">
					<h3 class=" mb-4 text-xl font-bold">{t('event.joinThisEvent')}</h3>

					{#if event.visibility === 'invite-only'}
						<div class="py-6 text-center">
							<div class="mb-3 text-4xl">🎫</div>
							<p class="font-semibold text-amber-400">{t('event.inviteOnlyBannerTitle')}</p>
							<p class="mt-1 text-sm text-amber-300">{t('common.inviteRequiredToDetails')}</p>
						</div>
					{:else if event.type === 'limited' && event.attendee_limit && confirmedLength(rsvps) >= event.attendee_limit}
						<div class="py-6 text-center">
							<div class="mb-3 text-4xl text-red-400">🚫</div>
							<p class="font-semibold text-red-400">{t('event.eventIsFull')}</p>
							<p class="mt-1 text-sm">{t('event.maximumCapacityReached')}</p>
						</div>
					{:else}
						<form
							method="POST"
							action="?/addRSVP"
							use:enhance={() => {
								isAddingRSVP = true;
								clearMessages();
								return async ({ result, update }) => {
									isAddingRSVP = false;
									if (result.type === 'failure') {
										error = String(result.data?.error || 'Failed to add RSVP');
									}
									update();
								};
							}}
							class="space-y-4"
						>
							<input type="hidden" name="userId" value={currentUserId} />
							<div>
								<label for="attendeeName" class=" mb-2 block text-sm font-semibold">
									{t('event.yourNameLabel')}
									<span class="text-red-400">{t('common.required')}</span>
								</label>
								<input
									id="attendeeName"
									name="newAttendeeName"
									type="text"
									bind:value={newAttendeeName}
									class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
									placeholder={t('event.yourNamePlaceholder')}
									maxlength="50"
									required
								/>
							</div>

							<!-- Add attendee status -->
							<div>
								<label for="attendeeStatus" class=" mb-2 block text-sm font-semibold">
									<!-- {t('event.yourNameLabel')} -->
									<!-- <span class="text-red-400">{t('common.required')}</span> -->
								</label>
								{#each ["Yes", "No", "Maybe"] as attendeeStatus}
									<input
										id="attendeeStatus"
										name="newAttendeeStatus"
										type="radio"
										value={attendeeStatus}
										bind:group={newAttendeeStatus}
										class="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
									/>
									{attendeeStatus} {" "}
								{/each}
							</div>

							<!-- Add Guests Toggle -->
							<div class="flex items-center space-x-3">
								<input
									id="addGuests"
									type="checkbox"
									bind:checked={addGuests}
									class="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
								/>
								<label for="addGuests" class="text-sm font-medium text-white">
									{t('event.addGuestsLabel')}
								</label>
							</div>

							<!-- Number of Guests Input -->
							{#if addGuests}
								<div>
									<label for="numberOfGuests" class="mb-2 block text-sm font-semibold">
										{t('event.numberOfGuestsLabel')}
										<span class="text-red-400">{t('common.required')}</span>
									</label>
									<input
										id="numberOfGuests"
										name="numberOfGuests"
										type="number"
										bind:value={numberOfGuests}
										min="1"
										max="10"
										class="border-dark-300 w-full rounded-sm border-2 px-4 py-3 text-slate-900 shadow-sm"
										placeholder={t('event.numberOfGuestsPlaceholder')}
										required
									/>
									<p class="mt-1 text-xs text-slate-400">
										{t('event.guestsWillBeAddedAs', {
											name: newAttendeeName || t('common.yourNamePlaceholder')
										})}
									</p>
								</div>
							{/if}

							<button
								type="submit"
								disabled={isAddingRSVP ||
									!newAttendeeName.trim() ||
									(addGuests && numberOfGuests < 1)}
								class=" hover:bg-violet-400/70' w-full rounded-sm border-2 border-violet-500 bg-violet-400/20 px-4 py-3 py-4 font-bold font-medium font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105"
							>
								{#if isAddingRSVP}
									<div class="flex items-center justify-center">
										<div
											class="mr-2 h-5 w-5 animate-spin rounded-full border-b-2 border-white"
										></div>
										{t('event.adding')}
									</div>
								{:else if addGuests && numberOfGuests > 0}
									{t('event.joinEventWithGuests', {
										count: numberOfGuests,
										plural: numberOfGuests > 1 ? 's' : ''
									})}
								{:else}
									{t('event.joinEventButton')}
								{/if}
							</button>
						</form>
					{/if}
				</div>

				<!-- Attendees List -->
				{#if event.visibility !== 'invite-only'}
					<div class="rounded-sm border p-6 shadow-2xl backdrop-blur-sm">
						<div class="mb-4 flex items-center justify-between">
							<h3 class=" text-xl font-bold">{t('event.attendeesTitle')}</h3>
							<span class="text-2xl font-bold">{confirmedLength(rsvps)}</span>
						</div>

						{#if rsvps.length === 0}
							<div class="text-dark-400 py-8 text-center">
								<p>{t('event.noAttendeesYet')}</p>
								<p class="mt-1 text-sm">{t('event.beFirstToJoin')}</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each rsvps as attendee, i (i)}
									<div
										class="flex items-center justify-between rounded-sm border border-white/20 p-3"
									>
										<div class="flex items-center space-x-3">
											<div
												class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold {attendee.name.includes(
													"'s Guest"
												)
													? 'text-white-400 bg-violet-500/40'
													: 'bg-violet-500/20 text-violet-400'}"
											>
												{attendee.name.charAt(0).toUpperCase()}
											</div>
											<div>
												<p
													class="font-medium text-white {attendee.name.includes("'s Guest")
														? 'text-amber-300'
														: ''}"
												>
													 {attendee.name}
												</p>
												<p class="text-xs text-violet-400">
													{(() => {
														const date = new Date(attendee.created_at);
														const year = date.getFullYear();
														const month = String(date.getMonth() + 1).padStart(2, '0');
														const day = String(date.getDate()).padStart(2, '0');
														const hours = String(date.getHours()).padStart(2, '0');
														const minutes = String(date.getMinutes()).padStart(2, '0');

														const date_format = formatDate(`${year}-${month}-${day}`);
														const time_format = formatTime(`${hours}:${minutes}`);

														return `${date_format} ${time_format}`;
													})()}
												</p>
											</div>
										</div>
										<div>
												{(() => {
													const status_format = formatStatus(attendee.status)
													return status_format
												})()}
										

										{#if attendee.user_id === currentUserId}
											<form
												method="POST"
												action="?/removeRSVP"
												use:enhance={() => {
													clearMessages();
													return async ({ result, update }) => {
														if (result.type === 'failure') {
															error = String(result.data?.error || 'Failed to remove RSVP');
														}
														update();
													};
												}}
												style="display: inline;"
											>
												<input type="hidden" name="rsvpId" value={attendee.id} />
												<button
													type="submit"
													class="text-dark-400 p-1 transition-colors duration-200 hover:text-red-400"
													aria-label={t('event.removeRsvpAriaLabel')}
												>
													<svg
														class="h-4 w-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														></path>
													</svg>
												</button>
											</form>
										{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="max-w-2xl space-y-3">
					{#if event.visibility !== 'invite-only'}
						<button
							on:click={copyEventLink}
							disabled={!isEventCreator}
							class="w-full rounded-sm border-2 px-4 py-3 py-4 font-bold font-medium font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 {isEventCreator
								? 'border-violet-500 bg-violet-400/20 hover:bg-violet-400/70'
								: 'cursor-not-allowed border-gray-500 bg-gray-600/20 hover:bg-gray-600/30'}"
						>
							{t('event.copyLinkButton')}
						</button>
					{/if}
					<button
						on:click={openCalendarModal}
						class="hover:bg-violet-400/70' w-full rounded-sm border-2 border-violet-500 bg-violet-400/20 px-4 py-3 py-4 font-bold font-medium font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105"
					>
						{t('event.addToCalendarButton')}
					</button>
				</div>

				<!-- Event Photos -->
				<div class="rounded-sm border p-6 shadow-2xl backdrop-blur-sm">
						<div class="mb-4 flex items-center justify-between">
							<h3 class=" text-xl font-bold">{t('event.photosTitle')}</h3>
						</div>

						{#if media.length === 0}
							<div class="text-dark-400 py-8 text-center">
								<p>{t('event.noPhotosYet')}</p>
							</div>
						{:else}
							<div class="container">
								<!-- Link attribute to actual user name from event (if available) -->
								<Slide image={`/api/media/${media[imageShowingIndex].id}`} 
										altTag={`${currentMediaAttribute}'s Photo'`} 
										attribute={currentMediaAttribute}
										slideNo={imageShowingIndex} 
										totalSlides={media.length}
										canDelete={canDeleteCurrentImage}
										on:prevClick={prevSlide}
										on:nextClick={nextSlide}
										/>
							</div>
						{/if}
						{#if canUploadMedia}
							<div class="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<input
									bind:this={uploadInput}
									id="event-photo-upload"
									type="file"
									accept="image/jpeg,image/png,image/webp"
									multiple
									class="hidden"
									on:change={handleFileSelection}
								/>

								<!-- Add photos and selected count -->
								<div class="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-start">
									<label
										for="event-photo-upload"
										class="inline-flex shrink-0 cursor-pointer items-center rounded-sm border border-violet-500 bg-violet-400/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400/50"
									>
										<span class="mr-2 text-lg leading-none">+</span>
										Add photos
									</label>

									{#if selectedFiles.length > 0}
										<span class="whitespace-nowrap text-xs text-violet-300">
											{selectedFiles.length} selected
										</span>
									{/if}
								</div>

								{#if selectedFiles.length > 0}
									<!-- Mobile: second line, full width -->
									<!-- Desktop: same line, right aligned -->
									<div class="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-end">
										<button
											type="button"
											title={`Upload ${selectedFiles.length} selected images`}
											aria-label={`Upload ${selectedFiles.length} selected images`}
											class="flex h-10 w-10 items-center justify-center rounded-sm border border-teal-400 bg-teal-400/20 text-teal-200 transition hover:bg-teal-400/40"
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
													d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
												/>
											</svg>
										</button>

										<button
											type="button"
											title="Cancel photo selection"
											aria-label="Cancel photo selection"
											on:click={clearSelectedFiles}
											class="flex h-10 w-10 items-center justify-center rounded-sm border border-gray-400/60 bg-gray-400/10 text-gray-200 transition hover:bg-gray-400/25"
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
													d="M6 6l12 12M18 6L6 18"
												/>
											</svg>
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
			</div>
		{/if}
	</div>
</div>

<!-- Calendar Modal -->
{#if calendarEvent && browser}
	<CalendarModal
		bind:isOpen={showCalendarModal}
		event={calendarEvent}
		{eventId}
		baseUrl={$page.url.origin}
		on:close={closeCalendarModal}
	/>
{/if}

<!-- Success/Error Messages -->
{#if success}
	{#if typeToShow === 'add'}
		<div
			class="fixed right-4 bottom-4 z-40 w-128 rounded-sm border border-green-500/30 bg-green-900 p-4 text-green-400"
		>
			{success}
		</div>
	{:else if typeToShow === 'remove'}
		<div
			class="fixed right-4 bottom-4 z-40 w-128 rounded-sm border border-yellow-500/30 bg-yellow-900 p-4 text-yellow-400"
		>
			{t('event.removedRsvpSuccessfully')}
		</div>
	{:else if typeToShow === 'copy'}
		<div
			class="fixed right-4 bottom-4 z-40 w-128 rounded-sm border border-yellow-500/30 bg-yellow-900 p-4 text-yellow-400"
		>
			{t('event.eventLinkCopied')}
		</div>
	{:else}
		<!-- fallback -->
	{/if}
{/if}

{#if error}
	<div
		class="fixed right-4 bottom-4 z-40 w-128 rounded-sm border border-red-500/30 bg-red-900 p-4 text-red-400"
	>
		{error}
	</div>
{/if}
