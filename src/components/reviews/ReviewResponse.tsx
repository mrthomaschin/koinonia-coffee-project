import React from "react";
import "./Reviews.css";

/** Koinonia's public reply under a review. */
export const ReviewResponse: React.FC<{ response: string }> = ({
  response,
}) => (
  <div className="review-response">
    <strong>Response from Koinonia Coffee Project</strong>
    <p>{response}</p>
  </div>
);

export default ReviewResponse;
