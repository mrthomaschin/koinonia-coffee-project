# Quick Reference Guide

## Common Commands

### Setup & Installation

```bash
# Run automated setup
./setup-firebase.sh

# Install dependencies manually
npm install                    # Root dependencies
cd functions && npm install    # Functions dependencies

# Login to Firebase
firebase login

# Set Firebase project
firebase use YOUR_PROJECT_ID
```

### Local Development

```bash
# Start Firebase Functions emulator
firebase emulators:start --only functions

# Start React development server (separate terminal)
npm start

# Build functions (TypeScript compilation)
cd functions && npm run build
```

### Environment Configuration

```bash
# Create environment files
cp .env.example .env
cp functions/.env.example functions/.env

# Set Firebase secrets (production)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# View Firebase secrets
firebase functions:secrets:access STRIPE_SECRET_KEY
```

### Building & Deployment

```bash
# Build React app
npm run build

# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

### Monitoring & Debugging

```bash
# View function logs
firebase functions:log

# View function logs (streaming)
firebase functions:log --follow

# List Firebase projects
firebase projects:list

# Check current project
firebase use
```

### Testing

```bash
# Test React app
npm test

# Lint functions code
cd functions && npm run lint

# Build and check for errors
cd functions && npm run build
```

## Environment Variables

### Frontend (.env)
```
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
REACT_APP_BACKEND_URL=http://127.0.0.1:5001/PROJECT_ID/us-central1/api
```

### Functions (functions/.env) - Local Only
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Production - Use Firebase Secrets
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

## API Endpoints

Base URL (Local): `http://127.0.0.1:5001/PROJECT_ID/us-central1/api`
Base URL (Production): `https://us-central1-PROJECT_ID.cloudfunctions.net/api`

- `POST /create-checkout-session` - Create Stripe checkout
- `GET /checkout-session/:sessionId` - Get session details
- `POST /webhook` - Stripe webhook handler

## Stripe Configuration

### Test Mode
1. Use test API keys (pk_test_... and sk_test_...)
2. Use test card: 4242 4242 4242 4242
3. Any future expiry date and CVC

### Production Mode
1. Switch to live API keys (pk_live_... and sk_live_...)
2. Configure webhook in Stripe Dashboard
3. Update Firebase secrets with live keys

### Webhook URL
```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook
```

### Webhook Events to Subscribe
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Troubleshooting

### Functions won't build
```bash
cd functions
rm -rf node_modules package-lock.json
npm install
npm run build
```

### CORS errors
- Check `REACT_APP_BACKEND_URL` in `.env`
- Verify Firebase Functions CORS is enabled (it is by default)

### Secrets not working
```bash
# List all secrets
firebase functions:secrets:access

# Re-set a secret
firebase functions:secrets:set STRIPE_SECRET_KEY

# Delete a secret
firebase functions:secrets:destroy STRIPE_SECRET_KEY
```

### Emulator not starting
```bash
# Kill any running processes on port 5001
lsof -ti:5001 | xargs kill -9

# Restart emulator
firebase emulators:start --only functions
```

### Deploy fails
```bash
# Check Firebase login
firebase login --reauth

# Verify project
firebase use

# Check functions build
cd functions && npm run build

# Try deploying just functions
firebase deploy --only functions
```

## File Structure

```
├── functions/              # Firebase Functions
│   ├── src/
│   │   └── index.ts       # Main function code
│   ├── lib/               # Compiled output
│   ├── .env               # Local secrets (gitignored)
│   └── package.json
├── src/                   # React app
│   ├── services/
│   │   └── stripeService.ts
│   └── ...
├── build/                 # Production build
├── .env                   # Frontend config (gitignored)
├── firebase.json          # Firebase config
└── package.json           # Root dependencies
```

## Important Notes

- Never commit `.env` files
- Use Firebase secrets for production
- Test locally before deploying
- Monitor Firebase usage to control costs
- Keep Stripe keys secure
- Update webhook URL after first deploy

## Resources

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [Stripe API Docs](https://stripe.com/docs/api)
- [STRIPE_DEPLOYMENT_GUIDE.md](./STRIPE_DEPLOYMENT_GUIDE.md) - Complete setup and deployment guide
