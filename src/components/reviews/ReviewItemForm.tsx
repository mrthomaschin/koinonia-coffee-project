import React, { useState } from 'react';
import { ReviewDraftItem } from '../../models/ReviewModel';
import { ICONS } from '../../util/constants';
import './Reviews.css';

export const MAX_REVIEW_LENGTH = 1000;
const MAX_PHOTOS = 4;
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

/** One product's answer on the review page. */
export interface ReviewItemState extends ReviewDraftItem {
  uploadingCount: number;
  error: string;
}

interface ReviewItemFormProps {
  item: ReviewItemState;
  onRate: (rating: number) => void;
  onTextChange: (text: string) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (url: string) => void;
}

/** Stars, an optional written review, and optional photos for one product. */
export const ReviewItemForm: React.FC<ReviewItemFormProps> = ({ item, onRate, onTextChange, onAddPhotos, onRemovePhoto }) => {
  const [hoverRating, setHoverRating] = useState(0);
  const shownRating = hoverRating || item.rating || 0;
  const textId = `review-text-${item.sku}`;

  return (
    <section className="review-item" aria-labelledby={`review-item-${item.sku}`}>
      <div className="review-page-product">
        <img src={item.imageUrl || ICONS.shopPlaceholder} alt="" />
        <h2 id={`review-item-${item.sku}`}>{item.productName}</h2>
      </div>

      <div className="review-star-input" role="radiogroup" aria-label={`Your rating for ${item.productName}`} onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            key={value}
            role="radio"
            aria-checked={item.rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            className={value <= shownRating ? 'filled' : ''}
            onMouseEnter={() => setHoverRating(value)}
            onClick={() => onRate(value)}
          >
            ★
          </button>
        ))}
        <span className="review-star-label">{RATING_LABELS[shownRating]}</span>
      </div>

      <label className="review-text-label" htmlFor={textId}>Your review (optional)</label>
      <textarea
        id={textId}
        className="review-textarea"
        value={item.text}
        onChange={(event) => onTextChange(event.target.value)}
        maxLength={MAX_REVIEW_LENGTH}
        rows={4}
        placeholder="What did you enjoy?"
      />
      <span className="review-char-count">{item.text.length}/{MAX_REVIEW_LENGTH}</span>

      <div className="review-photo-picker">
        {item.photos.map((url, index) => (
          <div className="review-photo-thumb" key={url}>
            <img src={url} alt={`Your upload ${index + 1}`} />
            <button type="button" onClick={() => onRemovePhoto(url)} aria-label={`Remove photo ${index + 1}`}>×</button>
          </div>
        ))}
        {Array.from({ length: item.uploadingCount }, (_, index) => (
          <div className="review-photo-thumb uploading" key={`uploading-${index}`} aria-label="Uploading photo" />
        ))}
        {item.photos.length + item.uploadingCount < MAX_PHOTOS && (
          <label className="review-photo-add">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                onAddPhotos(files.slice(0, MAX_PHOTOS - item.photos.length - item.uploadingCount));
              }}
            />
            <span aria-hidden="true">+</span>
            Add photos
          </label>
        )}
      </div>
      {item.error && <p className="review-page-error" role="alert">{item.error}</p>}
    </section>
  );
};

export default ReviewItemForm;
