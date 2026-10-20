export interface Announcement {
  id: string;
  message: string;
  /** Internal route ("/shop") or absolute URL. Omit for plain text. */
  href?: string;
  /** ISO date/time; the announcement is hidden before this. */
  startsAt?: string;
  /** ISO date/time; the announcement is hidden after this. */
  endsAt?: string;
}

/**
 * Static announcements shown in the top bar, in order. Add an entry (optionally with
 * startsAt/endsAt) to publish a new announcement; remove it or let it expire to retire it.
 * The next roast date is added automatically by useAnnouncements.
 */
export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'free-shipping', message: 'Free shipping on orders over $40', href: '/shop' },
];

export const isAnnouncementActive = (announcement: Announcement, now: Date = new Date()): boolean => {
  if (announcement.startsAt && now < new Date(announcement.startsAt)) return false;
  if (announcement.endsAt && now > new Date(announcement.endsAt)) return false;
  return true;
};
