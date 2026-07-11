# Embedded Stripe Checkout Guide

## Overview

Your checkout now uses **embedded Stripe Elements** instead of redirecting to Stripe's hosted page. This keeps users on your website throughout the entire payment process.

## How It Works

### User Flow
1. User clicks "Checkout" button in cart
2. A modal overlay appears with the payment form
3. User enters payment details directly on your site
4. Payment is processed without leaving the page
5. On success, cart is cleared and user sees confirmation

### Technical Flow
1. **Frontend**: `CartView` calls `stripeService.createPaymentIntent()`
2. **Backend**: Firebase Function creates a Stripe Payment Intent
3. **Frontend**: Receives `clientSecret` and shows `EmbeddedCheckout` component
4. **Stripe Elements**: Renders payment form with card input
5. **Payment**: User submits, Stripe processes payment
6. **Success**: Cart cleared, user redirected to confirmation page

## Key Components

### 1. **EmbeddedCheckout Component** (`src/components/EmbeddedCheckout.tsx`)
- Wraps Stripe's `PaymentElement`
- Handles payment submission
- Shows loading states and errors
- Customizable appearance

### 2. **Updated CartView** (`src/pages/cart/CartView.tsx`)
- Shows modal overlay when checkout clicked
- Creates Payment Intent via `stripeService`
- Handles success/cancel callbacks

### 3. **Backend API** (`functions/src/index.ts`)
- `/create-payment-intent` endpoint
- Creates Stripe Payment Intent
- Returns `clientSecret` to frontend

### 4. **Stripe Service** (`src/services/stripeService.ts`)
- `createPaymentIntent()` method
- Communicates with backend
- Handles errors

## Advantages Over Redirect

✅ **Better UX**: Users stay on your site  
✅ **More Control**: Customize the payment UI  
✅ **Faster**: No page redirects  
✅ **Mobile Friendly**: Better mobile experience  
✅ **Brand Consistency**: Matches your site design  

## Configuration

### Environment Variables

Make sure these are set in your `.env`:

```env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
REACT_APP_BACKEND_URL=http://localhost:3001
```

For production, update `REACT_APP_BACKEND_URL` to your Firebase Functions URL.

### Backend Setup

The Payment Intent endpoint is already configured in `functions/src/index.ts`:

```typescript
app.post("/create-payment-intent", async (req, res) => {
  // Creates Payment Intent with amount and metadata
});
```

## Customization

### Styling

Edit `src/components/EmbeddedCheckout.css` to match your brand:

```css
.embedded-checkout-container {
  /* Customize container */
}

.pay-btn {
  background: #your-brand-color;
}
```

### Stripe Elements Appearance

Modify the `appearance` object in `EmbeddedCheckout.tsx`:

```typescript
const options = {
  clientSecret,
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#333333', // Your brand color
      borderRadius: '8px',
      // ... more customization
    },
  },
};
```

## Testing

### Test Cards

Use these Stripe test cards:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Use any future expiration date, any 3-digit CVC, and any ZIP code.

### Local Testing

1. Start Firebase emulators:
   ```bash
   firebase emulators:start
   ```

2. Update `.env`:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:5001/your-project-id/us-central1/api
   ```

3. Start React app:
   ```bash
   npm start
   ```

## Switching Back to Redirect (If Needed)

If you prefer the redirect flow, you can still use it:

```typescript
// In CartView.tsx
const handleCheckout = async () => {
  await stripeService.createCheckoutSession(
    viewModel.cartItems,
    tax,
    shipping
  );
  // This will redirect to Stripe's hosted page
};
```

## Security Notes

- ✅ Payment details never touch your server
- ✅ PCI compliance handled by Stripe
- ✅ `clientSecret` is single-use and expires
- ✅ Payment Intent created server-side
- ✅ Amount validation happens on backend

## Troubleshooting

### "Stripe failed to load"
- Check `REACT_APP_STRIPE_PUBLISHABLE_KEY` in `.env`
- Ensure key starts with `pk_test_` or `pk_live_`

### "Failed to create payment intent"
- Verify backend URL is correct
- Check Firebase Functions are deployed
- Review Functions logs: `firebase functions:log`

### Modal doesn't appear
- Check browser console for errors
- Verify `@stripe/react-stripe-js` is installed
- Ensure `clientSecret` is being set

### Payment succeeds but cart doesn't clear
- Check `handleCheckoutSuccess` callback
- Verify navigation is working
- Check browser console for errors

## Next Steps

1. **Add shipping address collection** (optional)
2. **Implement order confirmation emails**
3. **Add order history tracking**
4. **Set up Stripe webhooks** for payment events
5. **Go live** with production keys

## Support

- [Stripe Elements Docs](https://stripe.com/docs/payments/elements)
- [Payment Intents API](https://stripe.com/docs/payments/payment-intents)
- [React Stripe.js](https://stripe.com/docs/stripe-js/react)
