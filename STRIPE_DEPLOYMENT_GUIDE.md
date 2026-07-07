# Stripe & Firebase Deployment Guide

Complete guide for setting up Stripe payments and deploying the Koinonia Coffee application to Firebase.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Getting Your Stripe API Keys](#getting-your-stripe-api-keys)
3. [Firebase Setup](#firebase-setup)
4. [Environment Configuration](#environment-configuration)
5. [Local Development](#local-development)
6. [Testing the Checkout Flow](#testing-the-checkout-flow)
7. [Production Deployment](#production-deployment)
8. [Webhook Configuration](#webhook-configuration)
9. [API Endpoints](#api-endpoints)
10. [Troubleshooting](#troubleshooting)
11. [Security Best Practices](#security-best-practices)

## Prerequisites

- Node.js (v24 or later)
- npm or yarn
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project created
- A Stripe account (sign up at https://stripe.com)

## Getting Your Stripe API Keys

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Click on **Developers** in the left sidebar
3. Click on **API keys**
4. Copy your **Publishable key** (starts with `pk_test_`) for the frontend
5. Copy your **Secret key** (starts with `sk_test_`) for the backend

**Important**: Use test keys (starting with `pk_test_` and `sk_test_`) for development. Switch to live keys only when ready for production.

## Firebase Setup

### 1. Login and Initialize Firebase

```bash
# Login to Firebase
firebase login

# Initialize Firebase (if not already done)
firebase init

# Select your Firebase project
firebase use YOUR_PROJECT_ID
```

Or use the automated setup script:

```bash
./setup-firebase.sh
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install functions dependencies
cd functions
npm install
cd ..
```

## Environment Configuration

### For Local Development

#### 1. Frontend Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
REACT_APP_BACKEND_URL=http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.

#### 2. Backend Configuration (Functions)

Create a `.env` file in the `functions` directory:

```bash
cp functions/.env.example functions/.env
```

Edit `functions/.env`:

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### For Production

**⚠️ Important: Firebase Blaze Plan Required**

Firebase Functions secrets require the **Blaze (pay-as-you-go) plan**. The good news:
- **Free tier includes**: 2M function invocations/month, 10GB hosting storage, 360MB/day transfer
- Most small to medium sites stay within free tier limits
- You only pay if you exceed free tier usage
- Set up billing alerts to monitor usage

To upgrade: Visit [Firebase Console](https://console.firebase.google.com/project/koinonia-coffee-project/usage/details) and click "Upgrade to Blaze"

#### 1. Set Firebase Secrets (Requires Blaze Plan)

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# Enter your Stripe secret key when prompted

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Enter your Stripe webhook secret when prompted
```

**Note**: If you're not ready to upgrade yet, you can develop and test everything locally using the `.env` files. Upgrade to Blaze only when you're ready to deploy to production.

#### 2. Update Frontend Environment

Update your production `.env`:

```env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_publishable_key
REACT_APP_BACKEND_URL=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```

## Local Development

### 1. Start Firebase Functions Emulator

```bash
firebase emulators:start --only functions
```

The emulator will run at `http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api`

### 2. Start the React Frontend

In a separate terminal:

```bash
npm start
```

The React app will run at `http://localhost:3000`

### 3. Set Up Local Webhooks (Optional)

For local webhook testing, use the Stripe CLI:

#### Install Stripe CLI

**macOS (using Homebrew)**:
```bash
brew install stripe-cli
```

**Windows (using Scoop)**:
```bash
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

**Linux**:
```bash
# Debian/Ubuntu
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz
tar -xvf stripe_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

**Alternative**: Download from [Stripe CLI Releases](https://github.com/stripe/stripe-cli/releases)

#### Forward Webhooks to Local Emulator

```bash
# Login to Stripe
stripe login

# Forward webhooks to your local Firebase Functions emulator
stripe listen --forward-to http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api/webhook
```

The CLI will display a webhook signing secret (starts with `whsec_`). Copy this and add it to your `functions/.env` file.

Keep the Stripe CLI running in a terminal while developing.

## Testing the Checkout Flow

### Test Card Numbers

Stripe provides test card numbers for testing:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires authentication**: `4000 0025 0000 3155`

Use any future expiration date, any 3-digit CVC, and any ZIP code.

### Checkout Flow

1. Add items to cart from the shop page
2. Navigate to `/cart`
3. Click "Checkout"
4. Review order on `/checkout` page
5. Click "Proceed to Payment"
6. Complete payment on Stripe's hosted checkout page
7. Get redirected to `/order-confirmation` with order details

## Production Deployment

### 1. Build the React App

```bash
npm run build
```

This creates a production build in the `build/` directory.

### 2. Deploy to Firebase

#### Deploy Everything (Recommended):
```bash
firebase deploy
```

#### Deploy Only Functions:
```bash
firebase deploy --only functions
```

#### Deploy Only Hosting:
```bash
firebase deploy --only hosting
```

### 3. Note Your Production URLs

After deployment, you'll have:
- **Frontend**: `https://YOUR_PROJECT_ID.web.app` or your custom domain
- **API**: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api`

## Webhook Configuration

### For Local Development

Use the Stripe CLI to forward webhooks (see [Local Development](#local-development) section).

### For Production

After deploying to Firebase, configure your production webhook:

#### Step 1: Configure Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Enter your webhook URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook`
4. Under **"Events to send"**, select:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Click **"Add endpoint"**
6. Copy the **webhook signing secret** (starts with `whsec_`)

#### Step 2: Update Firebase Secret

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Paste the webhook signing secret from Step 1
```

#### Step 3: Redeploy Functions

```bash
firebase deploy --only functions
```

#### Step 4: Test Your Webhook

1. Make a test purchase on your production site
2. In Stripe Dashboard, go to **Developers** > **Webhooks**
3. Click on your webhook endpoint
4. Check the **"Recent events"** tab to verify events are being received
5. Look for successful `200` responses

### Custom Domain Setup (Optional)

If you want to use a custom domain like `api.koinoniacoffeeproject.com`:

1. In Firebase Console, go to **Hosting**
2. Click **"Add custom domain"**
3. Follow the instructions to add DNS records
4. Update your webhook URL in Stripe Dashboard to use the custom domain

## API Endpoints

Your Firebase Function exposes these endpoints:

### POST `/create-checkout-session`

Creates a new Stripe checkout session.

**Request Body**:
```json
{
  "lineItems": [
    {
      "name": "Product Name",
      "amount": 2000,
      "currency": "usd",
      "quantity": 1,
      "images": ["https://example.com/image.jpg"]
    }
  ],
  "successUrl": "https://yoursite.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://yoursite.com/cart"
}
```

**Response**:
```json
{
  "url": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

### GET `/checkout-session/:sessionId`

Retrieves checkout session details.

**Response**:
```json
{
  "id": "cs_test_...",
  "payment_status": "paid",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "amount_total": 2000,
  "currency": "usd",
  "line_items": { ... }
}
```

### POST `/webhook`

Receives Stripe webhook events (requires webhook secret).

Handles these events:
- `checkout.session.completed` - Payment successful
- `payment_intent.succeeded` - Payment intent succeeded
- `payment_intent.payment_failed` - Payment failed

## Troubleshooting

### "Stripe failed to load"
- Check that `REACT_APP_STRIPE_PUBLISHABLE_KEY` is set correctly
- Ensure the key starts with `pk_test_` or `pk_live_`
- Verify the key is valid in your Stripe Dashboard

### "Failed to create checkout session"
- Verify Firebase Functions are deployed: `firebase deploy --only functions`
- Check `STRIPE_SECRET_KEY` is set as a Firebase secret
- Check browser console and Firebase Functions logs for errors: `firebase functions:log`

### Functions not deploying
```bash
# Check functions logs
firebase functions:log

# Rebuild functions
cd functions
npm run build
cd ..

# Try deploying again
firebase deploy --only functions
```

### CORS issues
- The functions are configured with `cors: true` to allow requests from your hosted domain
- If issues persist, check the Firebase Functions logs

### Environment variables not working
- **Local development**: Ensure `.env` files exist in root and `functions/` directories
- **Production**: Verify secrets are set: `firebase functions:secrets:access STRIPE_SECRET_KEY`

### Emulator connection issues
- Make sure your `REACT_APP_BACKEND_URL` in `.env` matches your Firebase project ID
- Verify the emulator is running: `firebase emulators:start --only functions`

### Webhook signature verification failed
- Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
- For local testing, use Stripe CLI and copy the webhook secret it provides
- For production, use the webhook secret from Stripe Dashboard
- You'll have **two different** webhook secrets: one for local and one for production

### "No checkout URL returned"
- Ensure line items have valid amounts (in cents, minimum 50 cents)
- Check that all required fields are provided
- Verify Stripe account is activated
- Check Firebase Functions logs for detailed error messages

## Security Best Practices

1. **Never commit API keys**: Keep `.env` files in `.gitignore`
2. **Use test keys in development**: Only use live keys in production
3. **Validate webhooks**: Always verify webhook signatures (already implemented)
4. **Use HTTPS in production**: Firebase provides HTTPS automatically
5. **Use Firebase secrets**: Never hardcode secrets in your code
6. **Implement rate limiting**: Consider adding rate limiting for production
7. **Log errors securely**: Don't expose sensitive data in logs
8. **Monitor usage**: Check Firebase Console regularly to control costs

## Cost Considerations

- **Firebase Functions**: Free tier includes 2M invocations/month
- **Firebase Hosting**: Free tier includes 10GB storage, 360MB/day transfer
- **Stripe**: No monthly fees, pay per transaction (2.9% + 30¢ for US cards)
- Monitor usage in Firebase Console
- The `maxInstances: 10` setting helps control costs by limiting concurrent function instances

## Project Structure

```
├── functions/              # Firebase Functions (Stripe backend)
│   ├── src/
│   │   └── index.ts       # Main function with Stripe endpoints
│   ├── lib/               # Compiled output
│   ├── package.json
│   ├── .env               # Local secrets (gitignored)
│   └── .env.example
├── src/                   # React frontend
│   ├── services/
│   │   └── stripeService.ts  # Stripe service client
│   └── ...
├── build/                 # Production build (created by npm run build)
├── .env                   # Frontend config (gitignored)
├── .env.example
├── firebase.json          # Firebase configuration
└── package.json           # Root dependencies
```

## Switching from Test to Live Mode

When you're ready to go live:

1. **Get live API keys** from Stripe Dashboard
2. **Update Firebase secrets** with live keys:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   # Enter sk_live_... key
   
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   # Enter live webhook secret
   ```
3. **Update frontend environment** with live publishable key:
   ```env
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
   ```
4. **Configure production webhook** in Stripe Dashboard with live mode enabled
5. **Test thoroughly** with real cards (start with small amounts)
6. **Deploy**:
   ```bash
   npm run build
   firebase deploy
   ```

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)

## Support

For issues specific to this integration:
1. Check browser console for frontend errors
2. Check Firebase Functions logs: `firebase functions:log`
3. Check Stripe Dashboard logs for payment errors

For platform-specific questions:
- [Stripe Support](https://support.stripe.com)
- [Firebase Support](https://firebase.google.com/support)

## Quick Command Reference

```bash
# Setup
./setup-firebase.sh                          # Automated setup
firebase login                               # Login to Firebase
firebase use YOUR_PROJECT_ID                 # Set project

# Local Development
firebase emulators:start --only functions    # Start emulator
npm start                                    # Start React app
stripe listen --forward-to ...               # Forward webhooks

# Deployment
npm run build                                # Build React app
firebase deploy                              # Deploy everything
firebase deploy --only functions             # Deploy functions only
firebase deploy --only hosting               # Deploy hosting only

# Secrets Management
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:access STRIPE_SECRET_KEY

# Monitoring
firebase functions:log                       # View logs
firebase functions:log --follow              # Stream logs
```
