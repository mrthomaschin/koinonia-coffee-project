import { Item } from '../pages/shop/item/ItemModel';

export const isLimitedTimeOfferAvailable = (item: Item | null | undefined): boolean => {
    if (!item || !item.ltoEndDate) return false;
    const now = new Date();
    return now < item.ltoEndDate;
};

export const allowsUnlimitedPurchases = (item: Item | null | undefined): boolean => {
    if (!item) return false;
    return isLimitedTimeOfferAvailable(item) && !!item.ltoUnlimitedPurchases;
};
