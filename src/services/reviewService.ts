import { createLogger } from '../util/logger';
import {
  ReviewDraft, reviewDraftFromApi, ReviewSummary, reviewSummaryFromApi,
} from '../models/ReviewModel';

const logger = createLogger('ReviewService');

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
// The backend refreshes reviews from Notion every 30 minutes; re-asking it
// more often than this within one visit only repeats the same answer.
const CLIENT_CACHE_MS = 5 * 60 * 1000;

/** The order an emailed review link points at. */
export interface ReviewLink {
  order: string;
  key: string;
}

/** One product within that order. */
export interface ReviewItemLink extends ReviewLink {
  sku: string;
}

const summaryCache = new Map<string, { fetchedAt: number; summary: ReviewSummary }>();

export const fetchProductReviews = async (sku: string): Promise<ReviewSummary> => {
  const cached = summaryCache.get(sku);
  if (cached && Date.now() - cached.fetchedAt < CLIENT_CACHE_MS) return cached.summary;

  const response = await fetch(`${backendUrl}/reviews/${encodeURIComponent(sku)}`);
  if (!response.ok) {
    logger.error(`Failed to fetch reviews for ${sku}: ${response.status}`);
    throw new Error('Unable to load reviews');
  }
  const summary = reviewSummaryFromApi(await response.json());
  summaryCache.set(sku, { fetchedAt: Date.now(), summary });
  return summary;
};

export const fetchReviewRequest = async (link: ReviewLink): Promise<ReviewDraft> => {
  const query = new URLSearchParams({ ...link }).toString();
  const response = await fetch(`${backendUrl}/reviews/request?${query}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'This review link is invalid or has expired.');
  return reviewDraftFromApi(body);
};

/** Stops all future review emails to the customer an emailed link belongs to. */
export const unsubscribeFromReviewEmails = async (link: ReviewLink): Promise<void> => {
  const response = await fetch(`${backendUrl}/reviews/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(link),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "We couldn't update your preferences. Please try again.");
  }
};

/** Undoes an unsubscribe from the same emailed link. */
export const resubscribeToReviewEmails = async (link: ReviewLink): Promise<void> => {
  const response = await fetch(`${backendUrl}/reviews/resubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(link),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "We couldn't update your preferences. Please try again.");
  }
};

/**
 * Saves a rating for the product a link points at. Text and photos are only
 * changed when given, so a star tap never clears what was written earlier.
 */
export const submitReview = async (link: ReviewItemLink, rating: number, text?: string, photos?: string[]): Promise<void> => {
  const response = await fetch(`${backendUrl}/reviews/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...link, rating, ...(text !== undefined ? { text } : {}), ...(photos ? { photos } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "We couldn't save your review. Please try again.");
  }
};

const MAX_PHOTO_DIMENSION = 1600;

/** Re-encodes a photo as a JPEG no larger than 1600px, keeping uploads small and phone photos upright. */
const shrinkPhoto = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('Unable to read that photo.'))),
    'image/jpeg',
    0.85,
  ));
};

/** Uploads one photo for the product a link points at and returns its public URL. */
export const uploadReviewPhoto = async (link: ReviewItemLink, file: File): Promise<string> => {
  const photo = await shrinkPhoto(file).catch(() => {
    throw new Error("We couldn't read that photo. Please try a JPEG or PNG.");
  });
  const response = await fetch(`${backendUrl}/reviews/photos?${new URLSearchParams({ ...link }).toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photo,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "We couldn't upload that photo. Please try again.");
  return body.url as string;
};
