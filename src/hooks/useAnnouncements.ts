import { useMemo } from 'react';
import { useInventory } from '../contexts/InventoryContext';
import { ItemType } from '../pages/shop/item/ItemModel';
import { ANNOUNCEMENTS, Announcement, isAnnouncementActive } from '../config/announcements';

const formatRoastDate = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(date);

/** Active static announcements plus a generated "next roast" message from the coffee inventory. */
export const useAnnouncements = (): Announcement[] => {
  const { items } = useInventory();

  return useMemo(() => {
    const now = new Date();
    const announcements = ANNOUNCEMENTS.filter(a => isAnnouncementActive(a, now));

    // Dates are day-granular, so compare against the start of today to keep a roast day itself visible.
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    startOfToday.setDate(startOfToday.getDate() - 1);

    const upcoming = items
      .filter(item => item.itemType === ItemType.coffee && item.nextRoastDate)
      .map(item => new Date(item.nextRoastDate as string))
      .filter(date => !isNaN(date.getTime()) && date >= startOfToday)
      .sort((a, b) => a.getTime() - b.getTime());

    if (upcoming.length > 0) {
      announcements.push({
        id: 'next-roast',
        message: `Next roast: ${formatRoastDate(upcoming[0])}`,
        href: '/shop',
      });
    }
    return announcements;
  }, [items]);
};
