import { database } from '$lib/database/db';
import { events, media } from '$lib/database/schema';
import type { Media} from '$lib/types';
import { fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { Actions } from './$types';
import { logger } from '$lib/logger';

export const load = async ({ cookies }) => {
	const userId = cookies.get('cactoideUserId');

	if (!userId) {
		return { events: [] };
	}

	try {
		const userEvents = await database
			.select()
			.from(events)
			.where(eq(events.userId, userId))
			.orderBy(desc(events.createdAt));

		const transformedEvents = userEvents.map((event) => ({
			id: event.id,
			name: event.name,
			date: event.date,
			time: event.time,
			location: event.location,
			location_type: event.locationType,
			location_url: event.locationUrl,
			type: event.type,
			attendee_limit: event.attendeeLimit,
			visibility: event.visibility,
			user_id: event.userId,
			created_at: event.createdAt?.toISOString() || new Date().toISOString(),
			updated_at: event.updatedAt?.toISOString() || new Date().toISOString()
		}));

		return { events: transformedEvents };
	} catch (error) {
		logger.error({ error, userId }, 'Error loading user events');
		return { events: [] };
	}
};

export const actions: Actions = {
	deleteEvent: async ({ request, cookies, fetch }) => {
		const formData = await request.formData();
		const eventId = formData.get('eventId') as string;
		const userId = cookies.get('cactoideUserId');

		if (!eventId || !userId) {
			return fail(400, { error: 'Event ID and User ID are required' });
		}

		try {
			// First verify the user owns this event
			const [eventData] = await database.select().from(events).where(eq(events.id, eventId));

			if (!eventData) {
				return fail(404, { error: 'Event not found' });
			}

			if (eventData.userId !== userId) {
				return fail(403, { error: 'You do not have permission to delete this event' });
			}

			// Get event files
			const eventMedia = await database.select().from(media).where(eq(media.eventId, eventId));

			const transformedMedia = eventMedia.map((media) => ({
				id: media.id,
				event_id: media.eventId,
				user_id: media.userId,
				storage_key: media.storageKey,
				created_at: media.createdAt?.toISOString() || new Date().toISOString()
			}));

			// Remove event files
			for (const image of transformedMedia) {
				const response = await fetch(
					`/api/event/${eventId}/media?mediaId=${encodeURIComponent(image.id)}`,
					{
						method: 'DELETE',
						credentials: 'same-origin'
					}
				);

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.error ?? 'Failed to delete image');
				}
			}

			// TODO: Add API endpoint to clean up empty directory

			// Delete the event (RSVPs will be deleted automatically due to CASCADE)
			await database.delete(events).where(eq(events.id, eventId));

			return { success: true };
		} catch (error) {
			logger.error({ error, eventId, userId }, 'Error deleting event');
			return fail(500, { error: 'Failed to delete event' });
		}
	}
};
