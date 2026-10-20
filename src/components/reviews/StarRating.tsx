import React from "react";
import "./Reviews.css";

interface StarRatingProps {
  rating: number;
  size?: number;
}

/** Read-only 5-star display; fractional ratings partially fill a star. */
export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  size = 16,
}) => {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <span
      className="star-rating"
      style={{ fontSize: size }}
      role="img"
      aria-label={`${clamped} out of 5 stars`}
    >
      <span className="star-rating-empty" aria-hidden="true">
        ★★★★★
      </span>
      <span
        className="star-rating-filled"
        aria-hidden="true"
        style={{ width: `${(clamped / 5) * 100}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
};

export default StarRating;
