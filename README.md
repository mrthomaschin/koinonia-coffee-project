# Koinonia Coffee Project

A React web application for Koinonia Coffee - cultivating community, one cup at a time.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase CLI (for deployment)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000).

### Available Scripts

- `npm start` - Runs the app in development mode
- `npm build` - Builds the app for production to the `build` folder
- `npm test` - Launches the test runner
- `npm eject` - Ejects from Create React App (one-way operation)

## Project Structure

```
src/
├── components/       # Reusable UI components (AppBar, BottomBar, ComingSoon)
├── pages/           # Page components (Homepage, Contact)
├── contexts/        # React Context providers for state management
├── constants.js     # App-wide constants (colors, fonts, assets)
├── App.js          # Main application component
└── index.js        # Application entry point

public/
├── assets/         # Static assets (fonts, images, logos, icons)
└── index.html      # HTML template
```

## Features

- **Homepage**: Hero section with brand messaging and company description
- **Shop**: Browse and purchase coffee and merchandise
- **Shopping Cart**: Add items, update quantities, and manage cart
- **Stripe Checkout**: Secure payment processing with Stripe
- **Order Confirmation**: Post-purchase confirmation with order details
- **Contact Page**: Contact form with email integration
- **Navigation**: Responsive navigation with mobile menu
- **Coming Soon Pages**: Placeholder pages for Menu, About, Blog, Gallery, and Events
- **Responsive Design**: Mobile-first design with breakpoints at 768px and 1024px

## E-Commerce Setup

This project includes a complete Stripe checkout integration powered by Firebase Functions. See [STRIPE_DEPLOYMENT_GUIDE.md](./STRIPE_DEPLOYMENT_GUIDE.md) for complete setup, configuration, and deployment instructions.

### Quick Start (Local Development - Free)

1. **Get your Stripe API keys** from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)

2. **Configure environment variables**:
   
   Create `.env` in project root:
   ```bash
   cp .env.example .env
   ```
   
   Update `.env`:
   ```env
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
   REACT_APP_BACKEND_URL=http://127.0.0.1:5001/koinonia-coffee-project/us-central1/api
   ```
   
   Update `functions/.env` with your Stripe keys:
   ```env
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

3. **Install dependencies**:
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

4. **Start Firebase emulator** (Terminal 1):
   ```bash
   firebase emulators:start --only functions
   ```

5. **Start React app** (Terminal 2):
   ```bash
   npm start
   ```

6. **Test checkout** at `http://localhost:3000` using test card `4242 4242 4242 4242`

**Note**: Local development uses environment variables and doesn't require Firebase Blaze plan or deployment.

## Production Deployment

**⚠️ Important**: Production deployment requires [Firebase Blaze (pay-as-you-go) plan](https://console.firebase.google.com/project/koinonia-coffee-project/usage/details)
- Free tier includes: 2M function invocations/month, 10GB hosting, 360MB/day transfer
- Most small/medium sites stay within free tier
- Only pay if you exceed free tier limits

### Deployment Steps

1. **Upgrade to Blaze plan** (if not already done)

2. **Set Firebase secrets**:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

3. **Update production environment**:
   ```env
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
   REACT_APP_BACKEND_URL=https://us-central1-koinonia-coffee-project.cloudfunctions.net/api
   ```

4. **Build and deploy**:
   ```bash
   npm run build
   firebase deploy
   ```

5. **Configure Stripe webhook** in [Stripe Dashboard](https://dashboard.stripe.com/webhooks):
   - URL: `https://us-central1-koinonia-coffee-project.cloudfunctions.net/api/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`

For detailed instructions, see [STRIPE_DEPLOYMENT_GUIDE.md](./STRIPE_DEPLOYMENT_GUIDE.md).

## Technologies Used

- **React 18** - UI library
- **TypeScript** - Type safety
- **Create React App** - Build tooling
- **React Context + Hooks** - State management
- **React Router** - Client-side routing
- **Stripe** - Payment processing
- **Firebase Functions** - Serverless backend API
- **Express.js** - API routing within Firebase Functions
- **CSS3** - Styling
- **Firebase Hosting** - Frontend deployment

## Custom Fonts

The project uses custom fonts located in `public/assets/fonts/`:
- HedvigLettersSerif_18pt - Primary headings
- ShipporiAntiqueB1 - Navigation and buttons
- Besley-Italic - Secondary text
- RethinkSans-Regular - Body text

## Contact

Email: hello@koinoniacoffeeproject.com  
Instagram: [@koinoniacoffeeproject](https://www.instagram.com/koinoniacoffeeproject)
