/** A photo attached to a review. */
export interface ReviewPhoto {
  url: string;
  // Photos uploaded straight into Notion have links that expire after about
  // an hour; the review sync copies them to Cloud Storage before publishing.
  hostedByNotion: boolean;
}

/** One row of the Notion "Product Reviews" database. */
export interface ReviewModel {
  // Notion page ID.
  id: string;
  productName: string;
  // Exact SKU purchased, e.g. B-KOIN-200G.
  productId: string;
  // Parent SKU the product page groups reviews under, e.g. B-KOIN.
  parentProductId: string;
  // 1–5 stars; 0 when the row has no rating.
  rating: number;
  firstName: string;
  lastName: string;
  orderId: string;
  // YYYY-MM-DD, or null when unknown.
  purchaseDate: string | null;
  // ISO timestamp of when the row was created.
  reviewDate: string;
  text: string;
  photos: ReviewPhoto[];
  approved: boolean;
  // Public reply from Koinonia, shown under the review. Empty when there isn't one.
  response: string;
}

/** The fields written when creating a review; Notion assigns the ID and review date. */
export type NewReview = Omit<ReviewModel, "id" | "reviewDate">;

export interface ProductReviewSummary {
  average: number;
  count: number;
  // Reviews with text or photos, newest first. Star-only ratings are counted but not listed.
  reviews: ReviewModel[];
}

export const hasValidRating = (review: ReviewModel): boolean =>
  Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5;

/**
 * The copy of a review the public website receives: the same shape, with
 * private fields made safe. Last name becomes an initial, the order number is
 * dropped, and approval is implied because only published reviews are sent.
 * Every photo has already been moved to Cloud Storage by the sync.
 */
export const toPublishedReview = (review: ReviewModel): ReviewModel => ({
  ...review,
  firstName: review.firstName || "Customer",
  lastName: review.lastName ? `${review.lastName.charAt(0).toUpperCase()}.` : "",
  orderId: "",
  photos: review.photos.filter((photo) => !photo.hostedByNotion),
  approved: true,
});
