import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Eyebrow } from '../../components/ui/Typography';
import { resubscribeToReviewEmails, unsubscribeFromReviewEmails } from '../../services/reviewService';
import '../../components/reviews/Reviews.css';

interface ReviewUnsubscribePageProps {
  availableHeight?: number;
}

/**
 * Landing page for the unsubscribe link in review request emails. Asks the
 * customer to confirm, so email link scanners opening the page don't
 * unsubscribe anyone by accident.
 */
const ReviewUnsubscribePage: React.FC<ReviewUnsubscribePageProps> = ({ availableHeight }) => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<'confirm' | 'saving' | 'done' | 'resubscribed'>('confirm');
  const [error, setError] = useState('');

  const link = { order: searchParams.get('order') || '', key: searchParams.get('key') || '' };

  const unsubscribe = async () => {
    setState('saving');
    setError('');
    try {
      await unsubscribeFromReviewEmails(link);
      setState('done');
    } catch (requestError) {
      setError((requestError as Error).message);
      setState('confirm');
    }
  };

  const resubscribe = async () => {
    setError('');
    try {
      await resubscribeToReviewEmails(link);
      setState('resubscribed');
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  return (
    <main style={{ minHeight: availableHeight }}>
      <div className="review-page review-page-thanks">
        {state === 'resubscribed' ? (
          <>
            <Eyebrow>WELCOME BACK</Eyebrow>
            <h1>You're back on the list.</h1>
            <p className="review-page-message">We'll ask for your thoughts after future orders arrive.</p>
            <Button as={Link} to="/shop" variant="outline">Back to the shop</Button>
          </>
        ) : state === 'done' ? (
          <>
            <Eyebrow>ALL SET</Eyebrow>
            <h1>You won't get review emails from us anymore.</h1>
            <p className="review-page-message">
              Order and shipping updates will still arrive as usual. If you have an account, you can still review
              orders from your order history, or turn review emails back on under Account details.
            </p>
            <Button as={Link} to="/shop" variant="outline">Back to the shop</Button>
            <p className="review-page-message review-resubscribe">
              Changed your mind? <button type="button" className="review-text-button" onClick={resubscribe}>Keep getting review requests</button>
            </p>
            {error && <p className="review-page-error" role="alert">{error}</p>}
          </>
        ) : (
          <>
            <Eyebrow>REVIEW EMAILS</Eyebrow>
            <h1>Stop review requests?</h1>
            <p className="review-page-message">
              We'll stop asking you to review your orders. Order and shipping updates will still arrive as usual.
            </p>
            <Button type="button" onClick={unsubscribe} disabled={state === 'saving'}>
              {state === 'saving' ? 'Saving…' : 'Unsubscribe'}
            </Button>
            {error && <p className="review-page-error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </main>
  );
};

export default ReviewUnsubscribePage;
