import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Eyebrow } from '../../components/ui/Typography';
import ReviewItemForm, { ReviewItemState } from '../../components/reviews/ReviewItemForm';
import { fetchReviewRequest, ReviewLink, submitReview, uploadReviewPhoto } from '../../services/reviewService';
import '../../components/reviews/Reviews.css';

/**
 * Landing page for the "Review your order" button in review request emails.
 * Lists every product in the order; customers rate as many as they like.
 * A star is saved the moment it's tapped, so ratings count even if they leave
 * before submitting. Text and photos are saved on Submit.
 */
interface ReviewPageProps {
  availableHeight?: number;
}

const ReviewPage: React.FC<ReviewPageProps> = ({ availableHeight }) => {
  const [searchParams] = useSearchParams();
  const link: ReviewLink = useMemo(() => ({
    order: searchParams.get('order') || '',
    key: searchParams.get('key') || '',
  }), [searchParams]);

  const [firstName, setFirstName] = useState('');
  const [items, setItems] = useState<ReviewItemState[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    fetchReviewRequest(link)
      .then((draft) => {
        setFirstName(draft.firstName);
        setItems(draft.items.map((item) => ({ ...item, uploadingCount: 0, error: '' })));
      })
      .catch((error: Error) => setLoadError(error.message));
  }, [link]);

  // The thank-you message replaces a long form; bring the customer back up to see it.
  useEffect(() => {
    if (isSubmitted) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isSubmitted]);

  const updateItem = (sku: string, update: (item: ReviewItemState) => Partial<ReviewItemState>) =>
    setItems((current) => current && current.map((item) => (item.sku === sku ? { ...item, ...update(item) } : item)));

  const rate = (sku: string, rating: number) => {
    updateItem(sku, () => ({ rating, error: '' }));
    setSubmitError('');
    submitReview({ ...link, sku }, rating).catch(() => undefined);
  };

  const addPhotos = async (sku: string, files: File[]) => {
    updateItem(sku, (item) => ({ uploadingCount: item.uploadingCount + files.length, error: '' }));
    await Promise.all(files.map(async (file) => {
      try {
        const url = await uploadReviewPhoto({ ...link, sku }, file);
        updateItem(sku, (item) => ({ photos: [...item.photos, url] }));
      } catch (error) {
        updateItem(sku, () => ({ error: (error as Error).message }));
      } finally {
        updateItem(sku, (item) => ({ uploadingCount: item.uploadingCount - 1 }));
      }
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!items) return;
    if (items.some((item) => item.uploadingCount > 0)) {
      setSubmitError('Please wait for your photos to finish uploading.');
      return;
    }
    const missingRating = items.filter((item) => !item.rating && (item.text.trim() || item.photos.length));
    missingRating.forEach((item) => updateItem(item.sku, () => ({ error: 'Please choose a star rating for this product.' })));
    const rated = items.filter((item) => item.rating);
    if (missingRating.length || rated.length === 0) {
      setSubmitError(rated.length === 0 ? 'Please rate at least one product.' : 'Please add a star rating to each product you wrote about.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    const results = await Promise.allSettled(rated.map((item) =>
      submitReview({ ...link, sku: item.sku }, item.rating as number, item.text, item.photos)));
    setIsSubmitting(false);
    const failed = rated.filter((_, index) => results[index].status === 'rejected');
    if (failed.length) {
      failed.forEach((item) => updateItem(item.sku, () => ({ error: "We couldn't save this review. Please try again." })));
      setSubmitError('Some reviews could not be saved. Please try again.');
      return;
    }
    setIsSubmitted(true);
  };

  // Fills the space between the header and footer, like the other pages.
  const fillScreen = (content: React.ReactNode) => <main style={{ minHeight: availableHeight }}>{content}</main>;

  if (loadError) return fillScreen(<div className="review-page"><p className="review-page-message">{loadError}</p></div>);
  if (!items) return fillScreen(<div className="review-page"><p className="review-page-message">Loading…</p></div>);

  if (isSubmitted) {
    return fillScreen(
      <div className="review-page review-page-thanks">
        <Eyebrow>THANK YOU</Eyebrow>
        <h1>We appreciate you, {firstName || 'friend'}.</h1>
        <p className="review-page-message">Your reviews help others find coffee they'll love.</p>
        <Button as={Link} to="/shop" variant="outline">Back to the shop</Button>
      </div>,
    );
  }

  return fillScreen(
    <form className="review-page" onSubmit={handleSubmit}>
      <div className="review-page-intro">
        <Eyebrow>THANKS, {(firstName || 'friend').toUpperCase()}</Eyebrow>
        <h1>How was your order?</h1>
        <p className="review-page-message">Rate as many items as you like. Written reviews and photos are optional.</p>
      </div>

      {items.map((item) => (
        <ReviewItemForm
          key={item.sku}
          item={item}
          onRate={(rating) => rate(item.sku, rating)}
          onTextChange={(text) => updateItem(item.sku, () => ({ text }))}
          onAddPhotos={(files) => addPhotos(item.sku, files)}
          onRemovePhoto={(url) => updateItem(item.sku, (current) => ({ photos: current.photos.filter((photo) => photo !== url) }))}
        />
      ))}

      <div className="review-form-footer">
        {submitError ? <p className="review-page-error" role="alert">{submitError}</p> : <span />}
        <Button type="submit" disabled={isSubmitting || items.some((item) => item.uploadingCount > 0)}>
          {isSubmitting ? 'Submitting…' : items.length > 1 ? 'Submit reviews' : 'Submit review'}
        </Button>
      </div>
    </form>,
  );
};

export default ReviewPage;
