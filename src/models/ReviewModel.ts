/** A photo attached to a review. */
export interface ReviewPhoto {
  url: string;
  // Always false on the website: the backend copies Notion-hosted photos to Cloud Storage before publishing.
  hostedByNotion: boolean;
}

/**
 * A product review. Mirrors the backend ReviewModel
 * (functions/src/domain/reviews/review_model.ts) field for field. The public
 * API sends safe values for private fields: last name is an initial, order
 * number is empty, and approved is always true.
 */
export interface ReviewModel {
  // Notion page ID.
  id: string;
  productName: string;
  // Exact SKU purchased, e.g. B-KOIN-200G.
  productId: string;
  // Parent SKU the product page groups reviews under, e.g. B-KOIN.
  parentProductId: string;
  // 1–5 stars.
  rating: number;
  firstName: string;
  // An initial, e.g. "C.".
  lastName: string;
  orderId: string;
  purchaseDate: Date | null;
  reviewDate: Date;
  text: string;
  photos: ReviewPhoto[];
  approved: boolean;
  // Public reply from Koinonia, shown under the review. Empty when there isn't one.
  response: string;
}

/** How a reviewer is shown on the site, e.g. "Thomas C.". */
export const reviewerName = (review: ReviewModel): string =>
  [review.firstName, review.lastName].filter(Boolean).join(" ");

/** Everything a product page shows about its reviews. */
export interface ReviewSummary {
  average: number;
  // Every published rating, including star-only ones.
  count: number;
  // Reviews with text or photos, newest first.
  reviews: ReviewModel[];
}

/** One product on the review page, with whatever the customer already saved for it. */
export interface ReviewDraftItem {
  // Parent SKU, e.g. B-KOIN.
  sku: string;
  productName: string;
  imageUrl: string;
  rating: number | null;
  text: string;
  photos: string[];
}

/** The order an emailed review link points at: every product the customer can review. */
export interface ReviewDraft {
  firstName: string;
  items: ReviewDraftItem[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const reviewFromApi = (data: any): ReviewModel => ({
  id: data.id || "",
  productName: data.productName || "",
  productId: data.productId || "",
  parentProductId: data.parentProductId || "",
  rating: Number(data.rating) || 0,
  firstName: data.firstName || "Customer",
  lastName: data.lastName || "",
  orderId: data.orderId || "",
  purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
  reviewDate: new Date(data.reviewDate),
  text: data.text || "",
  // Older cached responses sent photo URLs as plain strings.
  photos: (Array.isArray(data.photos) ? data.photos : []).map(
    (photo: any): ReviewPhoto =>
      typeof photo === "string"
        ? { url: photo, hostedByNotion: false }
        : { url: photo.url, hostedByNotion: !!photo.hostedByNotion },
  ),
  approved: data.approved !== false,
  response: data.response || "",
});

export const reviewSummaryFromApi = (data: any): ReviewSummary => ({
  average: Number(data.average) || 0,
  count: Number(data.count) || 0,
  reviews: Array.isArray(data.reviews) ? data.reviews.map(reviewFromApi) : [],
});

export const reviewDraftFromApi = (data: any): ReviewDraft => ({
  firstName: data.firstName || "",
  items: (Array.isArray(data.items) ? data.items : []).map(
    (item: any): ReviewDraftItem => ({
      sku: item.sku || "",
      productName: item.productName || "",
      imageUrl: item.imageUrl || "",
      rating: Number(item.rating) || null,
      text: item.text || "",
      photos: Array.isArray(item.photos) ? item.photos : [],
    }),
  ),
});
/* eslint-enable @typescript-eslint/no-explicit-any */
