import type { Event } from './types';

export const formatDate = (dateString: string): string => {
	// Parse the date string as local date to avoid timezone issues
	// Split the date string and create a Date object in local timezone
	const [year, month, day] = dateString.split('-').map(Number);
	const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
	const formattedYear = date.getFullYear();
	const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
	const formattedDay = String(date.getDate()).padStart(2, '0');
<<<<<<< HEAD
	return `${formattedMonth}/${formattedDay}/${formattedYear}`;
=======
	return `${formattedDay}/${formattedMonth}/${formattedYear}`;
>>>>>>> 1edba50 (Convert date to US)
};

export const formatTime = (timeString: string): string => {
	const [hours, minutes] = timeString.split(':');
	if (parseInt(hours) > 12) {
		return `${parseInt(hours) - 12}:${minutes} PM`;
	} if (parseInt(hours) == 0) {
		return `${12}:${minutes} AM`;
	}
	else {
		return `${hours}:${minutes} AM`;
	}
};

// Helper function to check if an event is within a time range
export const isEventInTimeRange = (event: Event, timeFilter: string): boolean => {
	if (timeFilter === 'any') return true;

	// Parse date and time as local timezone to avoid timezone issues
	const [year, month, day] = event.date.split('-').map(Number);
	const [hours, minutes, seconds] = event.time.split(':').map(Number);
	const eventDate = new Date(year, month - 1, day, hours, minutes, seconds || 0);
	const now = new Date();

	// Handle temporal status filters
	if (timeFilter === 'upcoming') {
		return eventDate >= now;
	}

	if (timeFilter === 'past') {
		return eventDate < now;
	}

	// Handle time range filters
	const ranges: Record<string, Date> = {
		'next-week': new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
		'next-month': new Date(new Date(now).setMonth(now.getMonth() + 1))
	};

	const endDate = ranges[timeFilter];
	return endDate ? eventDate >= now && eventDate <= endDate : true;
};
