import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchProductReviews } from "../../services/reviewService";
import { reviewerName, ReviewSummary } from "../../models/ReviewModel";
import { Eyebrow } from "../ui/Typography";
import StarRating from "./StarRating";
import ReviewResponse from "./ReviewResponse";
import ReviewPhotoModal, {
  collectReviewPhotos,
  findPhotoIndex,
  GalleryPhoto,
} from "./ReviewPhotoModal";
import "./Reviews.css";

const REVIEWS_PER_PAGE = 5;
const PHOTO_STRIP_LIMIT = 6;

/** Loads the review summary for a parent product SKU; null until loaded or on failure. */
export const useProductReviews = (sku?: string): ReviewSummary | null => {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  useEffect(() => {
    if (!sku) return;
    let cancelled = false;
    setSummary(null);
    fetchProductReviews(sku)
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sku]);

  return summary;
};

/** Page numbers to show, with null marking a gap: 1 … 4 5 6 … 12 */
const pageNumbers = (current: number, total: number): (number | null)[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  return sorted.flatMap((page, i) =>
    i > 0 && page - sorted[i - 1] > 1 ? [null, page] : [page],
  );
};

const formatReviewDate = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);

interface ProductReviewsProps {
  summary: ReviewSummary | null;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({ summary }) => {
  const [page, setPage] = useState(1);
  // undefined: closed, null: grid of all photos, number: one photo with its review.
  const [openPhoto, setOpenPhoto] = useState<number | null | undefined>(
    undefined,
  );
  const sectionRef = useRef<HTMLElement>(null);
  const allPhotos: GalleryPhoto[] = useMemo(
    () => collectReviewPhotos(summary?.reviews || []),
    [summary],
  );

  useEffect(() => {
    setPage(1);
  }, [summary]);

  if (!summary) return null;

  const totalPages = Math.max(
    1,
    Math.ceil(summary.reviews.length / REVIEWS_PER_PAGE),
  );
  const visibleReviews = summary.reviews.slice(
    (page - 1) * REVIEWS_PER_PAGE,
    page * REVIEWS_PER_PAGE,
  );

  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      className="product-reviews"
      ref={sectionRef}
      aria-labelledby="product-reviews-heading"
    >
      <div className="product-reviews-header">
        <Eyebrow>REVIEWS</Eyebrow>
        <h2 id="product-reviews-heading">What customers are saying.</h2>
      </div>

      {summary.count === 0 ? (
        <p className="product-reviews-empty">No reviews yet.</p>
      ) : (
        <>
          <div className="product-reviews-summary">
            <span className="product-reviews-average">
              {summary.average.toFixed(1)}
            </span>
            <div>
              <StarRating rating={summary.average} size={22} />
              <p className="product-reviews-count">
                Based on {summary.count}{" "}
                {summary.count === 1 ? "rating" : "ratings"}
              </p>
            </div>
          </div>

          {allPhotos.length > 0 && (
            <div className="review-photo-strip">
              <h3>Customer photos</h3>
              <div className="review-photo-row">
                {allPhotos.slice(0, PHOTO_STRIP_LIMIT).map((photo, index) => {
                  const remaining = allPhotos.length - PHOTO_STRIP_LIMIT;
                  const isMoreTile =
                    index === PHOTO_STRIP_LIMIT - 1 && remaining > 0;
                  return (
                    <button
                      type="button"
                      key={`${photo.reviewIndex}-${photo.photoIndex}`}
                      className="review-photo-button"
                      onClick={() => setOpenPhoto(isMoreTile ? null : index)}
                      aria-label={
                        isMoreTile
                          ? `See all ${allPhotos.length} photos`
                          : `Photo from ${reviewerName(photo.review)}'s review`
                      }
                    >
                      <img src={photo.url} alt="" loading="lazy" />
                      {isMoreTile && (
                        <span className="review-photo-more">
                          +{remaining + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {visibleReviews.length > 0 && (
            <ul className="product-reviews-list">
              {visibleReviews.map((review, index) => {
                const reviewIndex = (page - 1) * REVIEWS_PER_PAGE + index;
                return (
                  <li className="product-review" key={review.id || index}>
                    <div className="product-review-meta">
                      <strong>{reviewerName(review)}</strong>
                      <time dateTime={review.reviewDate.toISOString()}>
                        {formatReviewDate(review.reviewDate)}
                      </time>
                    </div>
                    <StarRating rating={review.rating} />
                    {review.text && (
                      <p className="product-review-text">{review.text}</p>
                    )}
                    {review.photos.length > 0 && (
                      <div className="review-photo-row">
                        {review.photos.map(({ url }, photoIndex) => (
                          <button
                            type="button"
                            key={`${url}-${photoIndex}`}
                            className="review-photo-button small"
                            onClick={() =>
                              setOpenPhoto(
                                findPhotoIndex(
                                  allPhotos,
                                  reviewIndex,
                                  photoIndex,
                                ),
                              )
                            }
                            aria-label={`Photo ${photoIndex + 1} from ${reviewerName(review)}'s review`}
                          >
                            <img src={url} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                    {review.response && (
                      <ReviewResponse response={review.response} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              className="product-reviews-pagination"
              aria-label="Review pages"
            >
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              {pageNumbers(page, totalPages).map((pageNumber, index) =>
                pageNumber === null ? (
                  <span key={`gap-${index}`} className="product-reviews-gap">
                    …
                  </span>
                ) : (
                  <button
                    type="button"
                    key={pageNumber}
                    className={pageNumber === page ? "active" : ""}
                    aria-current={pageNumber === page ? "page" : undefined}
                    onClick={() => goToPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
            </nav>
          )}
        </>
      )}

      {openPhoto !== undefined && (
        <ReviewPhotoModal
          photos={allPhotos}
          initialIndex={openPhoto}
          formatDate={formatReviewDate}
          onClose={() => setOpenPhoto(undefined)}
        />
      )}
    </section>
  );
};

export default ProductReviews;
