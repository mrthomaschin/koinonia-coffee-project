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

### Apple Pay Integration

The checkout supports Apple Pay as a payment method. To enable Apple Pay in production:

1. **Register and verify your domain** in the [Stripe Dashboard](https://dashboard.stripe.com/settings/payment_methods/apple_pay/domains)
   - Add your production domain (e.g., `yourdomain.com`)
   - Stripe will automatically handle domain verification through their domain association service
   - No manual file upload is required with Stripe's current verification process

2. **HTTPS requirement**: Apple Pay only works over HTTPS. This is automatically satisfied when deployed to Firebase Hosting.

3. **Testing Apple Pay**:
   - In development, Apple Pay may not work due to domain verification requirements
   - Test with Stripe test cards like `4242 4242 4242 4242` for card payments
   - For Apple Pay testing, deploy to a verified domain or use Stripe's test mode with a verified test domain

For more details, see [Stripe's Apple Pay documentation](https://stripe.com/docs/payments/apple-pay).

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

## Account and order-history setup

The `/account` page stores accounts in Firestore—not Notion. Each account has an immutable ID such as `acct_8b57…`, a unique username and email, profile data, an account `label`, and a salted scrypt password hash. Labels are `consumer` (the default public-signup account), `partner`, `wholesale`, or `church-ministry`; the last two are child programs of `partner`. The browser receives neither the password hash nor a Notion credential.

Existing account documents can be backfilled once with `npm --prefix functions run migrate:account-labels`. The command uses Google Application Default Credentials and only adds `label: "consumer"` to account documents that do not already have a label.

The Functions backend is the only component with Firestore access. Notion remains the source for existing online-order history; it is queried by the signed-in account's email and cached briefly in Firestore.

### Roast subscriptions

Authenticated customers can manage four roast-session subscription plans from the `/account` page:

| Plan | Delivery cadence | Coffee discount | Shipping |
| --- | --- | --- | --- |
| One bag every roast | Every roast session | 5% | Paid by customer |
| Two bags every roast | Every roast session | 5% | Free |
| One bag every other roast | Every second roast session | 5% | Paid by customer |
| Two bags every other roast | Every second roast session | 5% | Free |

A roast session is created around the roaster's confirmed schedule, which usually varies between two and three weeks. The current release manages enrollment and cancellation; charging and order creation should be triggered by a confirmed roast-session fulfillment workflow rather than a fixed calendar interval.

Firestore is the source of truth for subscriptions, which permits multiple subscriptions per account and keeps customer actions independent of the Notion API. Optionally, each create or cancellation is mirrored to a separate Notion **Subscriptions** database for operations.

To enable the mirror, create the database below, share it with the Functions Notion integration, then set its ID in `functions/.env.local` and as a Firebase secret. If the database is unconfigured or a sync fails, the Firestore subscription remains available to customers.

| Property | Notion type |
| --- | --- |
| `Name` | Title |
| `Subscription ID` | Text |
| `Account ID` | Text |
| `Plan` | Text |
| `Bag Count` | Number |
| `Cadence` | Text |
| `Item SKU` | Text |
| `Item Name` | Text |
| `Weight` | Text |
| `Discount Percent` | Number |
| `Free Shipping` | Checkbox |
| `Next Eligible Session` | Number |
| `Status` | Select — add `active`, `paused`, and `canceled` |
| `Skip Next Delivery` | Checkbox |
| `Created At` | Date |
| `Next Eligible Roast At` | Date |

```env
NOTION_SUBSCRIPTIONS_DATABASE_ID=your_notion_subscriptions_database_id
NOTION_ROAST_DATES_DATABASE_ID=your_notion_roast_dates_database_id
```

```bash
npx -y firebase-tools@latest functions:secrets:set NOTION_SUBSCRIPTIONS_DATABASE_ID
```

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
