import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReviewModel, reviewerName } from '../../models/ReviewModel';
import StarRating from './StarRating';
import ReviewResponse from './ReviewResponse';
import './Reviews.css';

/** One photo in gallery order: reviews in list order, each review's photos in upload order. */
export interface GalleryPhoto {
  url: string;
  review: ReviewModel;
  reviewIndex: number;
  photoIndex: number;
}

/** Flattens reviews' photos into the order the gallery and the arrows follow. */
export const collectReviewPhotos = (reviews: ReviewModel[]): GalleryPhoto[] =>
  reviews.flatMap((review, reviewIndex) =>
    review.photos.map((photo, photoIndex) => ({ url: photo.url, review, reviewIndex, photoIndex })));

/** Gallery position of a review's photo, or -1. */
export const findPhotoIndex = (photos: GalleryPhoto[], reviewIndex: number, photoIndex: number): number =>
  photos.findIndex((photo) => photo.reviewIndex === reviewIndex && photo.photoIndex === photoIndex);

interface ReviewPhotoModalProps {
  photos: GalleryPhoto[];
  /** Photo to open on; null opens the grid of all photos. */
  initialIndex: number | null;
  formatDate: (date: Date) => string;
  onClose: () => void;
}

export const ReviewPhotoModal: React.FC<ReviewPhotoModalProps> = ({ photos, initialIndex, formatDate, onClose }) => {
  const [index, setIndex] = useState<number | null>(initialIndex);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const showPhoto = (next: number | null) => {
    setIndex(next === null ? null : (next + photos.length) % photos.length);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (index === null) return;
      if (event.key === 'ArrowRight') showPhoto(index + 1);
      if (event.key === 'ArrowLeft') showPhoto(index - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const current = index === null ? null : photos[index];

  return createPortal(
    <div className="review-modal-overlay" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={current ? 'Customer photo' : 'Customer photos'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="review-modal-header">
          {current ? (
            <button type="button" className="review-modal-back" onClick={() => showPhoto(null)}>
              ‹ All photos
            </button>
          ) : (
            <h3>Customer photos ({photos.length})</h3>
          )}
          <button type="button" className="review-modal-close" onClick={onClose} ref={closeRef} aria-label="Close">×</button>
        </div>

        <div className="review-modal-body" ref={bodyRef}>
          {current && index !== null ? (
            <div className="review-modal-detail">
              <div className="review-modal-image">
                <img src={current.url} alt={`Shared by ${reviewerName(current.review)}`} />
                {photos.length > 1 && (
                  <>
                    {/* Steps through this review's photos, then carries on into the neighbouring review. */}
                    <button type="button" className="review-modal-nav prev" onClick={() => showPhoto(index - 1)} aria-label="Previous photo">‹</button>
                    <button type="button" className="review-modal-nav next" onClick={() => showPhoto(index + 1)} aria-label="Next photo">›</button>
                    <span className="review-modal-counter">
                      {current.review.photos.length > 1
                        ? `Photo ${current.photoIndex + 1} of ${current.review.photos.length}`
                        : `${index + 1} / ${photos.length}`}
                    </span>
                  </>
                )}
              </div>
              <div className="review-modal-review">
                <StarRating rating={current.review.rating} size={18} />
                <div className="product-review-meta">
                  <strong>{reviewerName(current.review)}</strong>
                  <time dateTime={current.review.reviewDate.toISOString()}>{formatDate(current.review.reviewDate)}</time>
                </div>
                {current.review.text && <p className="product-review-text">{current.review.text}</p>}
                {current.review.response && <ReviewResponse response={current.review.response} />}
                {current.review.photos.length > 1 && (
                  <div className="review-photo-row">
                    {current.review.photos.map(({ url }, photoIndex) => (
                      <button
                        type="button"
                        key={`${url}-${photoIndex}`}
                        className={`review-photo-button ${photoIndex === current.photoIndex ? 'active' : ''}`}
                        onClick={() => showPhoto(findPhotoIndex(photos, current.reviewIndex, photoIndex))}
                        aria-label={`Photo ${photoIndex + 1} of ${current.review.photos.length}`}
                      >
                        <img src={url} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="review-modal-grid">
              {photos.map((photo, photoIndex) => (
                <button type="button" key={`${photo.reviewIndex}-${photo.photoIndex}`} className="review-photo-button" onClick={() => showPhoto(photoIndex)}>
                  <img src={photo.url} alt={`Shared by ${reviewerName(photo.review)}`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ReviewPhotoModal;
