# Koinonia Coffee Project - Complete Setup Guide

**Complete documentation for setting up, deploying, and managing the Koinonia Coffee Project e-commerce application.**

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Stripe Payment Integration](#stripe-payment-integration)
5. [Notion Order Tracking](#notion-order-tracking)
6. [Notion Inventory Management](#notion-inventory-management)
7. [Automated Email Notifications](#automated-email-notifications)
8. [Shipping & Local Pickup Options](#shipping--local-pickup-options)
9. [Embedded Checkout](#embedded-checkout)
10. [Deployment](#deployment)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)
13. [Security & Best Practices](#security--best-practices)
14. [Command Reference](#command-reference)

---

## Overview

The Koinonia Coffee Project is a full-stack e-commerce application built with:
- **Frontend**: React with TypeScript
- **Backend**: Firebase Functions
- **Payments**: Stripe Checkout (Embedded)
- **Order Management**: Notion Database
- **Notifications**: EmailJS (automated)
- **Hosting**: Firebase Hosting

### Key Features

✅ **Embedded Stripe Checkout** - Payment processing without leaving your site  
✅ **Notion Integration** - Automatic order tracking in Notion database  
✅ **Automated Notifications** - Email customers when orders ship/deliver  
✅ **Shipping Options** - Local pickup, standard, express, and overnight shipping  
✅ **Order Confirmation** - Beautiful order confirmation page with details  
✅ **Secure Backend** - All sensitive operations handled server-side  

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (v24 or later)
- **npm** or **yarn**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Firebase Project** (created at [console.firebase.google.com](https://console.firebase.google.com))
- **Stripe Account** (sign up at [stripe.com](https://stripe.com))
- **Notion Account** (sign up at [notion.so](https://notion.so))
- **EmailJS Account** (sign up at [emailjs.com](https://emailjs.com))

---

## Quick Start

### 1. Clone and Install

```bash
# Install root dependencies
npm install

# Install functions dependencies
cd functions && npm install && cd ..
```

### 2. Firebase Setup

```bash
# Login to Firebase
firebase login

# Use automated setup script
./setup-firebase.sh

# Or manually set project
firebase use YOUR_PROJECT_ID
```

### 3. Environment Configuration

Create environment files from examples:

```bash
# Frontend environment
cp .env.example .env

# Backend environment
cp functions/.env.example functions/.env.local
```

### 4. Start Development

```bash
# Terminal 1: Start Firebase emulator
firebase emulators:start --only functions

# Terminal 2: Start React app
npm start
```

Your app will be running at `http://localhost:3000`

---

## Stripe Payment Integration

### Getting Your Stripe API Keys

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Click **Developers** → **API keys**
3. Copy your **Publishable key** (`pk_test_...`)
4. Copy your **Secret key** (`sk_test_...`)

**Important**: Use test keys for development. Switch to live keys only for production.

### Frontend Configuration

Edit `.env`:

```env
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
REACT_APP_BACKEND_URL=http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.

### Backend Configuration (Local)

Edit `functions/.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Backend Configuration (Production)

**⚠️ Requires Firebase Blaze Plan** (pay-as-you-go, but includes generous free tier)

```bash
# Set Stripe secret key
firebase functions:secrets:set STRIPE_SECRET_KEY

# Set webhook secret
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

### Webhook Configuration

#### Local Development

Use the Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI (macOS)
brew install stripe-cli

# Login and forward webhooks
stripe login
stripe listen --forward-to http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/api/webhook
```

Copy the webhook signing secret and add to `functions/.env.local`.

#### Production

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/webhook`
4. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy the webhook signing secret
6. Update Firebase secret:
   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

### Test Cards

Use these Stripe test cards:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Use any future expiration date, any 3-digit CVC, and any ZIP code.

### API Endpoints

#### POST `/create-checkout-session`
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

#### GET `/checkout-session/:sessionId`
Retrieves checkout session details.

#### POST `/webhook`
Receives Stripe webhook events.

---

## Notion Order Tracking

### Step 1: Create Notion Database

1. Go to Notion and create a new page
2. Add a database (table view recommended)
3. Configure the following properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `Customer` | Title | Customer's full name |
| `Order #` | Rich Text | Order ID (8-character code) |
| `Status` | Status | Payment status (Paid, Pending, Refunded) |
| `Fulfillment` | Status | Order fulfillment (Pending, Processing, Shipped, Delivered) |
| `Items ordered` | Rich Text | List of items with quantities and prices |
| `Email` | Email | Customer's email address |
| `Phone` | Phone Number | Customer's phone number |
| `Shipping address` | Rich Text | Shipping address |
| `Transaction ID` | Rich Text | Stripe transaction/session ID |
| `Receipt` | URL | Link to Stripe dashboard receipt |
| `Total` | Number | Order total amount (format as Dollar) |
| `Tracking Carrier` | Select | Shipping carrier (UPS, USPS, FedEx) |
| `Tracking Info` | Text | Tracking number and carrier info |
| `Order created` | Date | Timestamp when order was created |
| `Last updated` | Last Edited Time | Auto-updated by Notion |
| `Shipped Email Sent` | Checkbox | Tracks if shipped notification was sent |
| `Delivered Email Sent` | Checkbox | Tracks if delivered notification was sent |

#### Status Options

**Status property:**
- Paid (default)
- Pending
- Refunded

**Fulfillment property:**
- Pending (default)
- Processing
- Shipped
- Delivered

### Step 2: Create Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Fill in details:
   - **Name**: Koinonia Coffee Orders
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
4. Click **Submit**
5. Copy the **Internal Integration Token** (starts with `secret_`)

### Step 3: Share Database with Integration

1. Open your Notion database page
2. Click the **...** menu in the top right
3. Scroll down and click **Add connections**
4. Search for and select your integration
5. Click **Confirm**

### Step 4: Get Database ID

1. Open your Notion database in browser
2. Copy the URL:
   ```
   https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID
   ```
3. Extract the `DATABASE_ID` (32-character alphanumeric string)

### Step 5: Configure Environment Variables

#### Local Development

Edit `functions/.env.local`:

```bash
NOTION_TOKEN=secret_your_actual_integration_token_here
NOTION_ONLINE_ORDERS_DATABASE_ID=your_actual_database_id_here
```

Restart your Firebase emulator after updating.

#### Production

```bash
# Set Notion integration token
firebase functions:secrets:set NOTION_TOKEN

# Set Notion database ID
firebase functions:secrets:set NOTION_ONLINE_ORDERS_DATABASE_ID
```

### Step 6: Test Integration

1. Start Firebase emulator and React app
2. Complete a test order through checkout
3. Check Notion database for new entry with all order details

---

## Notion Inventory Management

### Overview

The inventory system fetches product data from a Notion database in real-time, allowing you to manage your shop items without code changes. This replaces the static `shopData.ts` file with a dynamic Notion database.

### Key Features

✅ **Real-time Inventory** - Products update instantly when you change Notion  
✅ **No Code Changes** - Add/edit products directly in Notion  
✅ **Type-Specific Properties** - Coffee and merchandise have different attributes  
✅ **Variant Support** - Track inventory per size/color (see variant guide)  
✅ **Active Toggle** - Hide/show products with a checkbox  
✅ **Fallback System** - Automatically falls back to sample data if Notion is unavailable  

### Step 1: Create Notion Integration (if not already done)

If you already created an integration for order tracking, you can reuse it. Otherwise:

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Fill in details:
   - **Name**: Koinonia Coffee Shop
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
4. Click **Submit**
5. Copy the **Internal Integration Token** (starts with `secret_`)

### Step 2: Create Inventory Database

1. In Notion, create a new page
2. Type `/database` and select **Table - Full page**
3. Name it **Shop Inventory** or similar

### Step 3: Configure Database Properties

#### Common Properties (All Items)

| Property Name | Type | Description | Required |
|--------------|------|-------------|----------|
| **Name** | Title | Product name | ✅ Yes |
| **SKU** | Text | Unique product identifier | ✅ Yes |
| **Description** | Text | Product description | ✅ Yes |
| **Price** | Number | Price in dollars (e.g., 10.00) | ✅ Yes |
| **Item Type** | Select | Type of item | ✅ Yes |
| **Quantity** | Number | Available stock quantity | ✅ Yes |
| **Images** | Files & media | Product images (URLs or uploads) | ✅ Yes |
| **Active** | Checkbox | Whether item is visible in shop | ✅ Yes |
| **Created At** | Date | When item was added | ✅ Yes |

#### Coffee-Specific Properties

| Property Name | Type | Description | Required for Coffee |
|--------------|------|-------------|---------------------|
| **Weights** | Multi-select | Available weights | ✅ Yes |
| **Roast Level** | Select | Roast level | ✅ Yes |
| **Origin** | Text | Coffee origin/region | ✅ Yes |
| **Tasting Notes** | Multi-select | Flavor notes | ✅ Yes |

#### Merchandise-Specific Properties

| Property Name | Type | Description | Required for Merch |
|--------------|------|-------------|-------------------|
| **Sizes** | Multi-select | Available sizes | For apparel |
| **Colors** | Multi-select | Available colors | Optional |

### Step 4: Configure Select Options

#### Item Type Options
Create these exact options in the **Item Type** select property:
- `Coffee`
- `Apparel`
- `Drinkware`
- `Accessories`
- `Stickers`
- `Brew Tools`

#### Weights Options (for Coffee)
Create these exact options in the **Weights** multi-select:
- `12oz`
- `16oz`
- `24oz`
- `200g`
- `5lb`

#### Roast Level Options (for Coffee)
Create these exact options in the **Roast Level** select:
- `Light`
- `Medium-Light`
- `Medium`
- `Medium-Dark`
- `Dark`

#### Sizes Options (for Apparel)
Create these exact options in the **Sizes** multi-select:
- `XS`
- `S`
- `M`
- `L`
- `XL`
- `XXL`

### Step 5: Share Database with Integration

1. Open your **Shop Inventory** database in Notion
2. Click the **•••** menu in the top right
3. Scroll down and click **+ Add connections**
4. Select your integration (e.g., "Koinonia Coffee Shop")
5. Click **Confirm**

### Step 6: Get Database ID

1. Open your **Shop Inventory** database in Notion
2. Look at the URL in your browser:
   ```
   https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID
   ```
3. Copy the **DATABASE_ID** (32-character string between the last `/` and the `?`)

### Step 7: Configure Environment Variables

#### Local Development

Edit `functions/.env.local`:

```env
NOTION_TOKEN=secret_your_actual_token_here
NOTION_INVENTORY_DATABASE_ID=your_actual_database_id_here
```

#### Production

```bash
firebase functions:secrets:set NOTION_INVENTORY_DATABASE_ID
```

If you haven't already set the Notion token:
```bash
firebase functions:secrets:set NOTION_TOKEN
```

### Step 8: Add Sample Data

#### Example Coffee Item

| Property      | Value                                                         |
| ---------------| ---------------------------------------------------------------|
| Name          | Ethiopia Yirgacheffe                                          |
| SKU           | B-ETH-001                                                     |
| Description   | A bright and floral coffee with notes of bergamot and jasmine |
| Price         | 15.00                                                         |
| Item Type     | Coffee                                                        |
| Quantity      | 10                                                            |
| Active        | ✅ Checked                                                     |
| Created At    | Today's date                                                  |
| Weights       | 200g, 5lb                                                     |
| Roast Level   | Light                                                         |
| Origin        | Ethiopia                                                      |
| Tasting Notes | Bergamot, Jasmine, Citrus                                     |
| Images        | (Upload or paste image URLs)                                  |

#### Example Merchandise Item

| Property | Value |
|----------|-------|
| Name | Koinonia Signature Tee |
| SKU | M-TEE-001 |
| Description | Premium cotton tee with signature logo |
| Price | 30.00 |
| Item Type | Apparel |
| Quantity | 25 |
| Active | ✅ Checked |
| Created At | Today's date |
| Sizes | S, M, L, XL |
| Colors | Beige, Black |
| Images | (Upload or paste image URLs) |

### Step 9: Test Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Start Firebase emulators:
   ```bash
   npm run emulators
   ```

3. Navigate to the shop page in your browser
4. You should see your Notion inventory items displayed
5. Check the browser console for success messages:
   ```
   📦 Fetching inventory from Notion database
   ✅ Successfully fetched X inventory items
   ✅ Loaded X items from Notion
   ```

### Managing Inventory

#### Adding New Items

1. Open your Notion inventory database
2. Click **+ New** to add a row
3. Fill in all required properties
4. Check the **Active** checkbox
5. Save - the item will appear in your shop immediately

#### Updating Items

1. Edit any property in Notion
2. Changes appear in the shop on next page load
3. To temporarily hide an item, uncheck **Active**

#### Removing Items

1. Uncheck the **Active** checkbox to hide from shop
2. Or delete the row entirely

### Image Management Best Practices

1. **Use consistent dimensions**: Recommended 800x800px or 1200x1200px
2. **Optimize file sizes**: Compress images before uploading
3. **Use external hosting**: For production, host images on:
   - Firebase Storage
   - Cloudinary
   - AWS S3
   - Any CDN with public URLs
4. **Multiple images**: Add multiple files to the Images property for product galleries

### Quick Property Reference

#### Required Properties (All Items)

| Property Name | Type          | Example Value                   | Notes                                                               |
| ---------------| ---------------| ---------------------------------| ---------------------------------------------------------------------|
| Name          | Title         | "Ethiopia Yirgacheffe"          | Product display name                                                |
| SKU           | Text          | "B-ETH-001"                     | Unique identifier                                                   |
| Description   | Text          | "A bright and floral coffee..." | Product description                                                 |
| Price         | Number        | 15.00                           | Price in USD                                                        |
| Item Type     | Select        | "Coffee"                        | Must be exact: Coffee, Apparel, Drinkware, Accessories, or Stickers |
| Quantity      | Number        | 10                              | Available stock                                                     |
| Images        | Files & media | [image URLs or files]           | Product images                                                      |
| Active        | Checkbox      | ✅                               | Must be checked to show in shop                                     |
| Created At    | Date          | 2026-07-13                      | Product creation date                                               |

#### Coffee-Specific Properties

| Property Name | Type | Example Value | Options |
|--------------|------|---------------|---------|
| Weights | Multi-select | 200g, 5lb | 12oz, 16oz, 24oz, 200g, 5lb |
| Roast Level | Select | "Light" | Light, Medium-Light, Medium, Medium-Dark, Dark |
| Origin | Text | "Ethiopia" | Coffee origin/region |
| Tasting Notes | Multi-select | Bergamot, Jasmine | Any flavor descriptors |

#### Merchandise-Specific Properties

| Property Name | Type          | Example Value   | Options                  |
| ---------------| ---------------| -----------------| --------------------------|
| Sizes         | Multi-select  | S, M, L, XL     | S, M, L, XL              |
| Colors        | Multi-select  | Beige, Black    | Any color names          |

#### Important Notes

✅ **Property names are case-sensitive** - Must match exactly  
✅ **Active checkbox** - Only checked items appear in shop  
✅ **Item Type** - Must use exact values listed above  
✅ **Images** - Use public URLs or Notion file uploads  
✅ **Coffee items** - Must have Weights, Roast Level, Origin, Tasting Notes  
✅ **Apparel items** - Should have Sizes property filled  

### API Endpoint

The inventory is fetched via:
```
GET /get-inventory
```

Returns:
```json
{
  "items": [
    {
      "sku": "B-ETH-001",
      "name": "Ethiopia Yirgacheffe",
      "description": "...",
      "price": 15.00,
      "images": ["url1", "url2"],
      "itemType": "Coffee",
      "createdAt": "2026-07-13T...",
      "quantity": 10,
      "weights": ["200g", "5lb"],
      "roastLevel": "Light",
      "origin": "Ethiopia",
      "tastingNotes": ["Bergamot", "Jasmine"]
    }
  ]
}
```

---

## Variant-Based Inventory Tracking

### Overview

For products with multiple sizes, colors, or weights (like t-shirts or coffee bags), you can track inventory per variant while displaying as a single product. This uses a **parent-child variant system** where:
- **Parent items** are the main products displayed on your shop page
- **Variant items** track individual inventory for each size/color/weight combination

**Example**: One "Koinonia Signature Tee" listing with separate inventory for S, M, L, XL sizes.

### Database Structure

#### Parent Items (Main Products)

These are the products displayed on your shop page.

**Example: Koinonia Signature Tee**

| Property | Value |
|----------|-------|
| Name | Koinonia Signature Tee |
| SKU | M-TEE-001 |
| Description | Premium cotton tee with signature logo |
| Price | 30.00 |
| Item Type | Apparel |
| **Quantity** | 0 (not used for parent when variants exist) |
| Active | ✅ |
| Created At | 2026-07-13 |
| Sizes | S, M, L, XL (all available sizes) |
| Colors | Beige (available colors) |
| Images | [product images] |
| **Is Variant** | ❌ Unchecked |
| **Parent SKU** | (leave empty) |

#### Variant Items (Size/Color Specific)

These track individual inventory for each size/color combination.

**Example: Koinonia Signature Tee - Size S**

| Property | Value |
|----------|-------|
| Name | Koinonia Signature Tee - S |
| SKU | M-TEE-001-S |
| **Parent SKU** | M-TEE-001 |
| **Is Variant** | ✅ Checked |
| **Variant Size** | S |
| **Variant Color** | Beige |
| **Quantity** | 5 (actual stock for size S) |
| Active | ✅ |
| Item Type | Apparel |
| Price | (can be same as parent or variant-specific) |

**Repeat for each size:**
- M-TEE-001-M (Medium, Quantity: 8)
- M-TEE-001-L (Large, Quantity: 12)
- M-TEE-001-XL (Extra Large, Quantity: 3)

### Required Database Properties

Add these properties to your existing inventory database:

| Property Name | Type | Description | Required |
|--------------|------|-------------|----------|
| **Is Variant** | Checkbox | Check if this is a variant item | ✅ Yes |
| **Parent SKU** | Text | SKU of parent product (for variants only) | For variants |
| **Variant Size** | Select | Size for this variant | For apparel variants |
| **Variant Color** | Select | Color for this variant | For variants with colors |
| **Variant Weight** | Select | Weight for coffee variants | For coffee variants |

#### Variant Size Options
Create these options in the **Variant Size** select:
- `S`
- `M`
- `L`
- `XL`

#### Variant Weight Options (for Coffee)
Create these options in the **Variant Weight** select:
- `200g`
- `5lb`

### Setup Instructions

#### Step 1: Add New Properties

1. Open your inventory database
2. Add the following properties:
   - **Is Variant** (Checkbox)
   - **Parent SKU** (Text)
   - **Variant Size** (Select)
   - **Variant Color** (Select)
   - **Variant Weight** (Select)

#### Step 2: Convert Existing Items

For the Koinonia Signature Tee example:

1. **Keep one entry as the parent:**
   - Name: "Koinonia Signature Tee"
   - SKU: "M-TEE-001"
   - Is Variant: ❌ Unchecked
   - Quantity: 0 (or total across all sizes)
   - Sizes: S, M, L, XL (all available)

2. **Create variant entries for each size:**

   **Variant 1:**
   - Name: "Koinonia Signature Tee - S"
   - SKU: "M-TEE-001-S"
   - Parent SKU: "M-TEE-001"
   - Is Variant: ✅ Checked
   - Variant Size: S
   - Quantity: 5 (actual stock)
   - Active: ✅

   **Variant 2:**
   - Name: "Koinonia Signature Tee - M"
   - SKU: "M-TEE-001-M"
   - Parent SKU: "M-TEE-001"
   - Is Variant: ✅ Checked
   - Variant Size: M
   - Quantity: 8
   - Active: ✅

   **Variant 3:**
   - Name: "Koinonia Signature Tee - L"
   - SKU: "M-TEE-001-L"
   - Parent SKU: "M-TEE-001"
   - Is Variant: ✅ Checked
   - Variant Size: L
   - Quantity: 12
   - Active: ✅

   **Variant 4:**
   - Name: "Koinonia Signature Tee - XL"
   - SKU: "M-TEE-001-XL"
   - Parent SKU: "M-TEE-001"
   - Is Variant: ✅ Checked
   - Variant Size: XL
   - Quantity: 3
   - Active: ✅

#### Step 3: Test the Setup

1. Refresh your shop page
2. You should see **only one** "Koinonia Signature Tee" listing
3. When customers select a size, the system will check variant inventory
4. Out-of-stock sizes will be disabled automatically

### How It Works

#### Frontend Behavior

1. **Shop Page**: Shows only parent items (one listing per product)
2. **Product Page**:
   - Displays all available sizes from parent's "Sizes" property
   - When customer selects a size, checks variant inventory
   - Shows "Out of Stock" if variant quantity = 0
   - Shows available quantity for selected variant

#### Backend Processing

1. Fetches all items from database
2. Separates parent items and variants
3. Groups variants by Parent SKU
4. Attaches variant inventory to parent items
5. Returns parent items with embedded variant data

#### Data Structure

```json
{
  "sku": "M-TEE-001",
  "name": "Koinonia Signature Tee",
  "price": 30.00,
  "sizes": ["S", "M", "L", "XL"],
  "variants": [
    {
      "sku": "M-TEE-001-S",
      "size": "S",
      "quantity": 5
    },
    {
      "sku": "M-TEE-001-M",
      "size": "M",
      "quantity": 8
    },
    {
      "sku": "M-TEE-001-L",
      "size": "L",
      "quantity": 12
    },
    {
      "sku": "M-TEE-001-XL",
      "size": "XL",
      "quantity": 3
    }
  ]
}
```

### Use Cases

#### Apparel with Multiple Sizes
**Example: T-Shirts, Hoodies**
- Parent: "Koinonia Hoodie"
- Variants: S, M, L, XL (each with separate inventory)

#### Apparel with Size + Color Combinations
**Example: T-Shirt in Multiple Colors**
- Parent: "Koinonia Tee"
- Variants:
  - S-Beige, M-Beige, L-Beige, XL-Beige
  - S-Black, M-Black, L-Black, XL-Black

#### Coffee with Multiple Weights
**Example: Ethiopia Yirgacheffe**
- Parent: "Ethiopia Yirgacheffe"
- Variants:
  - 200g (Quantity: 15)
  - 5lb (Quantity: 3)

### Inventory Management

#### Adding Stock

1. Find the specific variant row (e.g., "M-TEE-001-M")
2. Update the Quantity field
3. Changes reflect immediately on website

#### Checking Stock Levels

Create a Notion view filtered by:
- **Is Variant** = Checked
- **Quantity** < 5 (low stock alert)

#### Reordering

Sort variants by:
- Parent SKU (to group by product)
- Variant Size (to see all sizes together)

#### Reporting

Create formulas to calculate:
- Total stock per parent: Sum of all variant quantities
- Best-selling sizes: Track which variants sell fastest

### Best Practices

#### SKU Naming Convention

Use consistent patterns:
- Parent: `M-TEE-001`
- Variants: `M-TEE-001-S`, `M-TEE-001-M`, etc.

For color variants:
- `M-TEE-001-S-BEIGE`
- `M-TEE-001-S-BLACK`

#### Variant Naming

Make variant names descriptive:
- ✅ "Koinonia Signature Tee - S"
- ✅ "Koinonia Signature Tee - M - Black"
- ❌ "Variant 1"

#### Active Status

- **Parent Active = ✅**: Product shows on shop
- **Variant Active = ✅**: Size is available for selection
- **Variant Active = ❌**: Size is hidden (discontinued)

#### Images

- Add images to **parent** item only
- Variants inherit parent images
- For color variants, you can add color-specific images to variants

### Migration Checklist

If you already have separate listings for each size:

- [ ] Identify which items need variant tracking
- [ ] Choose one entry to be the parent
- [ ] Add "Is Variant" and "Parent SKU" properties
- [ ] Mark other entries as variants
- [ ] Set Parent SKU on all variants
- [ ] Set Variant Size/Color on variants
- [ ] Verify parent has all sizes listed in Sizes property
- [ ] Test on website
- [ ] Verify only one listing appears
- [ ] Test size selection and inventory

### Troubleshooting

#### Multiple Listings Still Showing

**Issue**: Seeing 4 separate tee listings instead of 1

**Solution**:
1. Verify variants have "Is Variant" = ✅
2. Verify variants have correct "Parent SKU"
3. Check that only parent has "Is Variant" = ❌

#### Size Shows as Available but No Stock

**Issue**: Size S is selectable but shows 0 stock

**Solution**:
1. Check variant with Variant Size = "S" has quantity > 0
2. Verify Parent SKU matches exactly (case-sensitive)
3. Ensure variant is Active = ✅

#### Variant Not Linking to Parent

**Issue**: Variant exists but not showing in product

**Solution**:
1. Parent SKU must match parent's SKU exactly
2. Check for extra spaces in SKU fields
3. Verify both parent and variant are Active = ✅

### Example Database View

Create a filtered view to see variants grouped by parent:

**Filter**: Is Variant = Checked
**Sort**: Parent SKU (ascending), then Variant Size (ascending)

This shows all variants organized by product, making inventory management easier.

---

## Automated Email Notifications

### Overview

The system uses a **polling approach** with a Firebase scheduled function that:
- Runs every 10 minutes
- Checks Notion database for orders with updated fulfillment statuses
- Sends email notifications when orders are marked as "Shipped" or "Delivered"
- Prevents duplicate emails using tracking checkboxes in Notion

### How It Works

```
Every 10 minutes:
┌─────────────────────────────────────────────────────────┐
│ 1. Firebase Scheduler triggers checkOrderStatusUpdates │
│ 2. Query Notion for orders updated in last 15 minutes  │
│ 3. Check if Fulfillment = "Shipped" or "Delivered"     │
│ 4. If email not sent yet, send via EmailJS             │
│ 5. Mark checkbox in Notion to prevent duplicates       │
└─────────────────────────────────────────────────────────┘
```

### Prerequisites

Before setting up automated notifications, ensure you have:
1. ✅ Notion database configured (see [Notion Order Tracking](#notion-order-tracking))
2. ✅ EmailJS account with templates created
3. ✅ Firebase Functions deployed or emulator running

### Step 1: Update Notion Database Schema

Add two new checkbox properties to your Notion order database:

| Property Name          | Type     | Description                               |
| ------------------------| ----------| -------------------------------------------|
| `Shipped Email Sent`   | Checkbox | Tracks if shipped notification was sent   |
| `Delivered Email Sent` | Checkbox | Tracks if delivered notification was sent |

**How to add:**
1. Open your Notion order database
2. Click the **+** button to add a new property
3. Name it `Shipped Email Sent`
4. Select **Checkbox** as the type
5. Repeat for `Delivered Email Sent`

### Step 2: Create EmailJS Templates

#### Template 1: Order Shipped

**Template Variables (use these exact names in EmailJS):**
- `{{to_email}}` - Customer's email address
- `{{customer_name}}` - Customer's name
- `{{order_id}}` - Order ID (e.g., "ABC12345")
- `{{{items_html}}}` - HTML formatted list of items (use triple braces for HTML)
- `{{shipping_address}}` - Full shipping address
- `{{carrier}}` - Shipping carrier (default: "USPS")
- `{{tracking_number}}` - Tracking number (default: "Available soon")
- `{{estimated_delivery}}` - Estimated delivery time (default: "3-5 business days")
- `{{tracking_url}}` - URL to track package (default: USPS tracking)

**Steps to create:**
1. Go to [EmailJS Dashboard](https://dashboard.emailjs.com/) → Email Templates
2. Click **Create New Template**
3. Set **Subject**: `Your order #{{order_id}} has shipped! 📦`
4. Set **To Email**: `{{to_email}}`
5. Paste this HTML template:

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  
  <!-- Header -->
  <div style="background-color: #313D66; padding: 24px; text-align: center;">
    <img src="https://koinoniacoffeeproject.com/assets/logos/logo_circle.png" alt="Koinonia Coffee Project" style="height: 48px;">
  </div>
  
  <!-- Shipping Icon & Message -->
  <div style="padding: 40px 24px; text-align: center; border-bottom: 1px solid #e5e5e5;">
    <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #000000;">Your order is on its way!</h1>
    <p style="margin: 0; font-size: 16px; color: #666666;">Hi {{customer_name}}, your order has been shipped.</p>
  </div>
  
  <!-- Tracking Info -->
  <div style="padding: 24px; background-color: #f7f7f7;">
    <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #000000;">Tracking information</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Order number</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right; font-weight: 500;">{{order_id}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Carrier</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right;">{{carrier}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Tracking number</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right; font-weight: 500;">{{tracking_number}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Estimated delivery</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right;">{{estimated_delivery}}</td>
      </tr>
    </table>
    
    <!-- Track Package Button -->
    <div style="margin-top: 24px; text-align: center;">
      <a href="{{tracking_url}}" style="display: inline-block; background-color: #458500; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600;">Track your package</a>
    </div>
  </div>
  
  <!-- Items Section -->
  <div style="padding: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #000000;">Items in this shipment</h2>
    
    <div style="border-top: 1px solid #e5e5e5; padding-top: 16px;">
      {{{items_html}}}
    </div>
  </div>
  
  <!-- Shipping Address -->
  <div style="padding: 24px; background-color: #f7f7f7; margin: 0 24px 24px 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #000000;">Shipping address</h3>
    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.6;">
      {{customer_name}}<br>
      {{shipping_address}}
    </p>
  </div>
  
  <!-- Footer -->
  <div style="padding: 24px; text-align: center; border-top: 1px solid #e5e5e5;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666666;">
      Questions? Contact us at <a href="mailto:hello@koinoniacoffeeproject.com" style="color: #458500; text-decoration: none;">hello@koinoniacoffeeproject.com</a>
    </p>
    <p style="margin: 0; font-size: 12px; color: #999999;">
      © 2026 Koinonia Coffee Project. All rights reserved.
    </p>
  </div>
  
</div>
```

6. **Save** and copy the **Template ID**

#### Template 2: Order Delivered

**Template Variables (use these exact names in EmailJS):**
- `{{to_email}}` - Customer's email address
- `{{customer_name}}` - Customer's name
- `{{order_id}}` - Order ID (e.g., "ABC12345")
- `{{{items_html}}}` - HTML formatted list of items (use triple braces for HTML)
- `{{delivery_date}}` - Date when order was delivered (e.g., "January 15, 2026")
- `{{delivery_location}}` - Where package was left (default: "Front door")
- `{{review_url}}` - URL for customer to leave a review

**Steps to create:**
1. Go to [EmailJS Dashboard](https://dashboard.emailjs.com/) → Email Templates
2. Click **Create New Template**
3. Set **Subject**: `Your order #{{order_id}} has been delivered! 🎉`
4. Set **To Email**: `{{to_email}}`
5. Paste this HTML template:

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
  
  <!-- Header -->
  <div style="background-color: #313D66; padding: 24px; text-align: center;">
    <img src="https://koinoniacoffeeproject.com/assets/logos/logo_circle.png" alt="Koinonia Coffee Project" style="height: 48px;">
  </div>
  
  <!-- Delivery Icon & Message -->
  <div style="padding: 40px 24px; text-align: center; border-bottom: 1px solid #e5e5e5;">
    <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #000000;">Your order has been delivered!</h1>
    <p style="margin: 0; font-size: 16px; color: #666666;">Hi {{customer_name}}, your package was delivered on {{delivery_date}}.</p>
  </div>
  
  <!-- Delivery Info -->
  <div style="padding: 24px; background-color: #f7f7f7;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Order number</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right; font-weight: 500;">{{order_id}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Delivered on</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right;">{{delivery_date}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Delivered to</td>
        <td style="padding: 8px 0; font-size: 14px; color: #000000; text-align: right;">{{delivery_location}}</td>
      </tr>
    </table>
  </div>
  
  <!-- Items Section -->
  <div style="padding: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #000000;">Items delivered</h2>
    
    <div style="border-top: 1px solid #e5e5e5; padding-top: 16px;">
      {{{items_html}}}
    </div>
  </div>
  
  <!-- Feedback Section -->
  <div style="padding: 24px; background-color: #f7f7f7; margin: 0 24px 24px 24px; border-radius: 8px; text-align: center;">
    <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #000000;">How was your experience?</h3>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #666666; line-height: 1.5;">
      We'd love to hear your feedback! Share your thoughts about your order and help us improve.
    </p>
    <a href="{{review_url}}" style="display: inline-block; background-color: #458500; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">Leave a review</a>
  </div>
  
  <!-- Care Instructions -->
  <div style="padding: 24px; border-top: 1px solid #e5e5e5;">
    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #000000;">Enjoying your coffee?</h3>
    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.6;">
      For the best flavor, store your coffee in an airtight container away from light and heat. Grind just before brewing for optimal freshness. We recommend brewing within 2-3 weeks of the roast date for peak flavor.
    </p>
  </div>
  
  <!-- Footer -->
  <div style="padding: 24px; text-align: center; border-top: 1px solid #e5e5e5;">
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #666666;">
      Questions or issues with your order? <a href="mailto:hello@koinoniacoffeeproject.com" style="color: #458500; text-decoration: none;">Contact us</a>
    </p>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666666;">
      Follow us for brewing tips and new releases
    </p>
    <div style="margin-top: 12px;">
      <a href="https://instagram.com/koinoniacoffeeproject" style="display: inline-block; margin: 0 8px; color: #666666; text-decoration: none; font-size: 14px;">Instagram</a>
      <a href="https://facebook.com/koinoniacoffeeproject" style="display: inline-block; margin: 0 8px; color: #666666; text-decoration: none; font-size: 14px;">Facebook</a>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 12px; color: #999999;">
      © 2026 Koinonia Coffee Project. All rights reserved.
    </p>
  </div>
  
</div>
```

6. **Save** and copy the **Template ID**

### Step 3: Configure EmailJS Environment Variables

#### Local Development

Edit `functions/.env.local`:

```bash
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_PUBLIC_KEY=your_public_key_here
EMAILJS_SHIPPED_TEMPLATE_ID=template_xxxxxxx
EMAILJS_DELIVERED_TEMPLATE_ID=template_yyyyyyy
```

**Where to find these:**
- **Service ID**: EmailJS Dashboard → Email Services → Your Service
- **Public Key**: EmailJS Dashboard → Account → General
- **Template IDs**: EmailJS Dashboard → Email Templates → Your Template

Restart your Firebase emulator after updating the file.

#### Production

Use Firebase secrets to securely store credentials:

```bash
# Set EmailJS Service ID
firebase functions:secrets:set EMAILJS_SERVICE_ID

# Set EmailJS Public Key
firebase functions:secrets:set EMAILJS_PUBLIC_KEY

# Set Shipped Template ID
firebase functions:secrets:set EMAILJS_SHIPPED_TEMPLATE_ID

# Set Delivered Template ID
firebase functions:secrets:set EMAILJS_DELIVERED_TEMPLATE_ID
```

When prompted, paste your actual values from EmailJS.

### Step 4: Deploy the Scheduled Function

**⚠️ Requires Firebase Blaze Plan** (Cloud Scheduler costs ~$0.10/month)

#### For Local Testing (Emulator)

The scheduled function will run in the emulator, but **scheduled triggers don't auto-run in the emulator**.

**Use the test endpoint to manually trigger the check:**

```bash
# Trigger the order status check manually
curl http://127.0.0.1:5001/koinonia-coffee-project/us-central1/testOrderStatusCheck
```

This will:
- Check Notion for recently updated orders
- Send any pending emails
- Return a JSON response with results:
  ```json
  {
    "success": true,
    "message": "Order status check completed",
    "results": {
      "ordersChecked": 2,
      "emailsSent": 1,
      "errors": []
    }
  }
  ```

**Or use the Emulator UI:**
1. Open http://localhost:4000
2. Go to Functions → testOrderStatusCheck
3. Click "Send Request"
4. View the response and logs

#### For Production Deployment

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy just the scheduler
firebase deploy --only functions:checkOrderStatusUpdates
```

**Important:** Firebase Cloud Scheduler requires the **Blaze (pay-as-you-go) plan**. The function itself is free within Firebase's generous free tier, but the scheduler requires billing to be enabled.

**Cost estimate:**
- Cloud Scheduler: $0.10 per job per month (1 job = $0.10/month)
- Function invocations: ~4,320/month (every 10 min) - FREE (within 2M free tier)
- **Total monthly cost: ~$0.10**

### Step 5: Test the System

#### Test Workflow

1. **Create a test order** through your checkout flow
2. **Verify it appears in Notion** with Fulfillment = "Pending"
3. **Update the Fulfillment status** to "Shipped" in Notion
4. **Wait up to 10 minutes** (or manually trigger the function)
5. **Check:**
   - Customer receives "Shipped" email
   - `Shipped Email Sent` checkbox is checked in Notion
6. **Update Fulfillment** to "Delivered"
7. **Wait up to 10 minutes** (or manually trigger)
8. **Check:**
   - Customer receives "Delivered" email
   - `Delivered Email Sent` checkbox is checked in Notion

#### Local Testing (Development)

**Start Development Servers:**

```bash
./dev.sh
```

This will start:
- ✅ Frontend: http://localhost:3000
- ✅ Functions: http://127.0.0.1:5001/koinonia-coffee-project/us-central1/api
- ✅ Emulator UI: http://127.0.0.1:4000

**Test Workflow:**

1. **Create a test order in Notion** with:
   - Customer name
   - Email address (use your own email for testing)
   - Order #
   - Items ordered
   - Shipping address
   - Fulfillment: "Pending"

2. **Change status to "Shipped"** in Notion

3. **Trigger the check manually** using one of these methods:

   **Option A: Using curl**
   ```bash
   curl http://127.0.0.1:5001/koinonia-coffee-project/us-central1/testOrderStatusCheck
   ```

   **Option B: Using browser**
   Open: http://127.0.0.1:5001/koinonia-coffee-project/us-central1/testOrderStatusCheck

   **Option C: Using Emulator UI**
   - Open http://localhost:4000
   - Click "Functions" in the sidebar
   - Find "testOrderStatusCheck"
   - Click "Send Request"

4. **Check results** - You should see:
   ```json
   {
     "success": true,
     "message": "Order status check completed",
     "results": {
       "ordersChecked": 1,
       "emailsSent": 1,
       "errors": []
     }
   }
   ```

5. **Verify email sent:**
   - ✅ Check your email inbox for "Order Shipped" email
   - ✅ Check Notion - "Shipped Email Sent" checkbox should be checked
   - ✅ Check function logs in terminal for success messages

6. **Test "Delivered" status:**
   - Change Fulfillment to "Delivered" in Notion
   - Trigger the check again (same curl command)
   - Check for "Order Delivered" email
   - Verify "Delivered Email Sent" checkbox is checked

7. **Test duplicate prevention:**
   - Trigger the check again (without changing anything)
   - Verify NO new emails are sent
   - Check response shows `emailsSent: 0`

### Monitoring

View logs to monitor the scheduled function:

```bash
# Real-time logs
firebase functions:log --only checkOrderStatusUpdates

# Or view in Firebase Console
# https://console.firebase.google.com → Functions → Logs
```

**Expected log messages:**
```
✅ Starting order status check...
✅ Found X recently updated orders
✅ Sending shipped notification for order ABC123
✅ Shipped notification sent for order ABC123
✅ Order status check completed
```

### Customization

#### Change Polling Frequency

Edit `functions/src/index.ts`:

```typescript
const schedulerOptions: any = {
  schedule: "every 5 minutes",  // Change from 10 to 5 minutes
  timeZone: "America/Los_Angeles",
};
```

#### Add More Status Triggers

```typescript
// Add "Processing" notification
if (fulfillmentStatus === "Processing" && !processingEmailSent && processingTemplateId) {
  // Send processing email
}
```

#### Add More Email Variables

Modify the `sendEmailJSNotification` function to include additional order details:

```typescript
template_params: {
  to_email: toEmail,
  customer_name: customerName,
  order_id: orderId,
  status: status,
  tracking_number: trackingNumber,  // Add this
  estimated_delivery: estimatedDate, // Add this
},
```

### Troubleshooting

#### No emails are being sent

**Check:**
1. ✅ EmailJS credentials are correctly set in environment variables
2. ✅ Template IDs match your EmailJS templates
3. ✅ Notion database has the tracking checkbox properties
4. ✅ Customer email exists in the Notion order entry
5. ✅ Scheduled function is deployed and running (check Firebase Console)

**Debug:**
```bash
# Check function logs
firebase functions:log --only checkOrderStatusUpdates
```

#### Duplicate emails being sent

**Cause:** Tracking checkboxes aren't being updated in Notion

**Fix:**
1. Verify your Notion integration has **write permissions** to the database
2. Check that property names match exactly: `Shipped Email Sent` and `Delivered Email Sent`
3. Manually check the boxes to stop duplicate sends

#### Function not running on schedule

**Check:**
1. ✅ Firebase project is on **Blaze plan** (required for Cloud Scheduler)
2. ✅ Function is deployed: `firebase deploy --only functions:checkOrderStatusUpdates`
3. ✅ Check Cloud Scheduler in Firebase Console

**Enable Cloud Scheduler:**
```bash
# Check if scheduler is enabled
gcloud scheduler jobs list

# If not enabled, deploy the function to enable it
firebase deploy --only functions:checkOrderStatusUpdates
```

#### EmailJS rate limits

**Free tier limits:**
- 200 emails/month
- 2 email templates

**If you exceed limits:**
- Upgrade to EmailJS paid plan ($15/month for 1,000 emails)
- Or switch to SendGrid/Mailgun

---

## Shipping & Local Pickup Options

### Overview

The embedded checkout includes **shipping options**:
- ✅ **Local Pickup** (Free)
- ✅ **Standard Shipping** ($8.99)
- ✅ **Express Shipping** ($15.99)
- ✅ **Overnight Shipping** ($24.99)

### User Experience

1. User clicks "Checkout" in cart
2. Modal appears with shipping options at the top
3. User selects shipping method (defaults to Standard)
4. If **Local Pickup** → No address needed
5. If **Shipping** → Address form appears
6. Total updates automatically with shipping cost
7. User completes payment

### Components

#### ShippingSelector Component
- Location: `src/components/ShippingSelector.tsx`
- Radio button interface for shipping options
- Updates total in real-time

#### Updated EmbeddedCheckout
- Shows subtotal, shipping, and total breakdown
- Conditionally shows address form (hidden for local pickup)
- Uses Stripe's `AddressElement` for shipping addresses

### Customizing Shipping Options

Edit `src/components/ShippingSelector.tsx`:

```typescript
const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'local-pickup',
    label: 'Local Pickup',
    price: 0,
    description: 'Pick up at our location - Free'
  },
  {
    id: 'standard',
    label: 'Standard Shipping',
    price: 8.99,
    description: '5-7 business days'
  },
  // Add more options...
];
```

### Features

✅ **Dynamic Total Calculation** - Updates automatically when shipping changes  
✅ **Conditional Address Collection** - No address for local pickup  
✅ **Order Confirmation** - Shipping details saved and displayed  

### Local Pickup Configuration

Update the description in `ShippingSelector.tsx`:

```typescript
{
  id: 'local-pickup',
  label: 'Local Pickup',
  price: 0,
  description: 'Pick up at 123 Main St, Your City - Free'
}
```

---

## Embedded Checkout

### Overview

Your checkout uses **embedded Stripe Elements** instead of redirecting to Stripe's hosted page. Users stay on your website throughout the entire payment process.

### How It Works

1. User clicks "Checkout" button in cart
2. Modal overlay appears with payment form
3. User enters payment details directly on your site
4. Payment is processed without leaving the page
5. On success, cart is cleared and user sees confirmation

### Key Components

#### 1. EmbeddedCheckout Component
- Location: `src/components/EmbeddedCheckout.tsx`
- Wraps Stripe's `PaymentElement`
- Handles payment submission
- Shows loading states and errors

#### 2. Updated CartView
- Shows modal overlay when checkout clicked
- Creates Payment Intent via `stripeService`
- Handles success/cancel callbacks

#### 3. Backend API
- `/create-payment-intent` endpoint
- Creates Stripe Payment Intent
- Returns `clientSecret` to frontend

### Advantages

✅ **Better UX** - Users stay on your site  
✅ **More Control** - Customize the payment UI  
✅ **Faster** - No page redirects  
✅ **Mobile Friendly** - Better mobile experience  
✅ **Brand Consistency** - Matches your site design  

### Customization

#### Styling

Edit `src/components/EmbeddedCheckout.css`:

```css
.embedded-checkout-container {
  /* Customize container */
}

.pay-btn {
  background: #your-brand-color;
}
```

#### Stripe Elements Appearance

Modify the `appearance` object in `EmbeddedCheckout.tsx`:

```typescript
const options = {
  clientSecret,
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#333333', // Your brand color
      borderRadius: '8px',
    },
  },
};
```

---

## Deployment

### Build the React App

```bash
npm run build
```

This creates a production build in the `build/` directory.

### Deploy to Firebase

#### Deploy Everything

```bash
firebase deploy
```

#### Deploy Only Functions

```bash
firebase deploy --only functions
```

#### Deploy Only Hosting

```bash
firebase deploy --only hosting
```

### Production URLs

After deployment:
- **Frontend**: `https://YOUR_PROJECT_ID.web.app` or custom domain
- **API**: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api`

### Switching to Live Mode

When ready to go live:

1. **Get live API keys** from Stripe Dashboard
2. **Update Firebase secrets**:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   # Enter sk_live_... key
   
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   # Enter live webhook secret
   ```
3. **Update frontend environment**:
   ```env
   REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
   ```
4. **Configure production webhook** in Stripe Dashboard
5. **Test thoroughly** with real cards
6. **Deploy**:
   ```bash
   npm run build
   firebase deploy
   ```

---

## Testing

### Complete Checkout Flow

1. Add items to cart from shop page
2. Navigate to `/cart`
3. Click "Checkout"
4. Select shipping option
5. Enter payment details
6. Complete payment
7. Verify order confirmation page
8. Check Notion database for order entry
9. Check customer email for confirmation

### Test Each Shipping Option

1. **Local Pickup**:
   - Select "Local Pickup"
   - Verify no address form appears
   - Check total = subtotal (no shipping)

2. **Standard Shipping**:
   - Select "Standard Shipping"
   - Fill in address
   - Verify total = subtotal + $8.99

3. **Express/Overnight**:
   - Test higher-priced options
   - Verify correct amounts

### Test Automated Notifications

1. Create test order
2. Change Fulfillment to "Shipped" in Notion
3. Wait 10 minutes (or manually trigger function)
4. Verify customer receives "Shipped" email
5. Check `Shipped Email Sent` checkbox is marked
6. Change Fulfillment to "Delivered"
7. Wait 10 minutes
8. Verify customer receives "Delivered" email
9. Check `Delivered Email Sent` checkbox is marked

### Manual Function Trigger (Emulator)

1. Open http://localhost:4000 (emulator UI)
2. Go to Functions → checkOrderStatusUpdates
3. Click "Run function"

---

## Troubleshooting

### Stripe Issues

#### "Stripe failed to load"
- Check `REACT_APP_STRIPE_PUBLISHABLE_KEY` in `.env`
- Ensure key starts with `pk_test_` or `pk_live_`
- Verify key is valid in Stripe Dashboard

#### "Failed to create checkout session"
- Verify Firebase Functions are deployed
- Check `STRIPE_SECRET_KEY` is set as Firebase secret
- Review Functions logs: `firebase functions:log`

#### "No checkout URL returned"
- Ensure line items have valid amounts (minimum 50 cents)
- Check all required fields are provided
- Verify Stripe account is activated

### Notion Issues

#### "Notion integration not configured"
- Check both `NOTION_TOKEN` and `NOTION_ONLINE_ORDERS_DATABASE_ID` are set
- Restart Firebase emulator after adding variables
- For production, ensure secrets are set

#### "Failed to create Notion order"
- Verify integration has been added to database
- Check all property names match exactly (case-sensitive)
- Ensure Status and Fulfillment properties have correct options
- Check browser console for detailed errors

#### Property type mismatch errors
- Verify all database properties match specified types
- Property names are case-sensitive

### Email Notification Issues

#### No emails being sent (Local Testing)

**Check the test endpoint response:**
```bash
curl http://127.0.0.1:5001/koinonia-coffee-project/us-central1/testOrderStatusCheck
```

Look for errors in the response:
```json
{
  "results": {
    "errors": ["Order ABC123: No email address"]
  }
}
```

**Common issues:**
- ❌ EmailJS credentials not set in `functions/.env.local`
- ❌ Template IDs don't match EmailJS dashboard
- ❌ Notion checkboxes don't exist
- ❌ Order doesn't have customer email

**Check environment variables:**
```bash
cat functions/.env.local
```

Should have:
```
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_PUBLIC_KEY=your_public_key_here
EMAILJS_SHIPPED_TEMPLATE_ID=template_xxxxxxx
EMAILJS_DELIVERED_TEMPLATE_ID=template_yyyyyyy
NOTION_TOKEN=secret_xxxxxxx
NOTION_ONLINE_ORDERS_DATABASE_ID=xxxxxxx
```

**Check function logs:**
```bash
# In the terminal where dev.sh is running, look for:
✅ Found 1 recently updated orders
✅ Sending shipped notification for order ABC123
✅ Shipped notification sent for order ABC123
```

#### No emails being sent (Production)
- Check EmailJS credentials in Firebase secrets
- Verify template IDs match EmailJS templates
- Ensure Notion database has tracking checkbox properties
- Check customer email exists in Notion order entry
- Verify scheduled function is deployed and running

#### Duplicate emails
- Verify tracking checkboxes are being updated in Notion
- Check Notion integration has write permissions
- Manually check boxes to stop duplicates

#### Function not running on schedule
- Ensure Firebase project is on **Blaze plan**
- Verify function is deployed
- Check Cloud Scheduler in Firebase Console

#### Function returns 500 error
- Verify all environment variables are set correctly
- Check function logs for detailed error messages
- Rebuild functions: `cd functions && npm run build`

#### Emulator UI not showing Functions
1. Stop the dev server (Ctrl+C)
2. Rebuild functions:
   ```bash
   cd functions
   npm run build
   cd ..
   ```
3. Restart: `./dev.sh`
4. Check for build errors in terminal

### Firebase Issues

#### Functions won't build
```bash
cd functions
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### CORS errors
- Check `REACT_APP_BACKEND_URL` in `.env`
- Verify Firebase Functions CORS is enabled (default)

#### Secrets not working
```bash
# List all secrets
firebase functions:secrets:access

# Re-set a secret
firebase functions:secrets:set STRIPE_SECRET_KEY

# Delete a secret
firebase functions:secrets:destroy STRIPE_SECRET_KEY
```

#### Emulator not starting
```bash
# Kill processes on port 5001
lsof -ti:5001 | xargs kill -9

# Restart emulator
firebase emulators:start --only functions
```

#### Deploy fails
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

---

## Security & Best Practices

### Security Checklist

- ✅ Never commit `.env` files (they're gitignored)
- ✅ Use test keys in development
- ✅ Use Firebase secrets for production
- ✅ Validate webhooks (already implemented)
- ✅ Use HTTPS in production (Firebase provides automatically)
- ✅ Payment details never touch your server (handled by Stripe)
- ✅ PCI compliance handled by Stripe
- ✅ Notion API calls made from backend (secure)

### Best Practices

1. **Environment Variables**
   - Keep `.env` files in `.gitignore`
   - Use Firebase secrets for production
   - Never hardcode secrets in code

2. **Testing**
   - Test locally before deploying
   - Use Stripe test cards
   - Verify webhooks are working

3. **Monitoring**
   - Monitor Firebase usage to control costs
   - Check Firebase Console regularly
   - Review function logs for errors
   - Monitor EmailJS usage (200 emails/month free tier)

4. **Cost Control**
   - Set up billing alerts in Firebase
   - Monitor function invocations
   - `maxInstances: 10` limits concurrent functions

### Cost Breakdown

#### Firebase (Blaze Plan)
- **Free tier includes**:
  - 2M function invocations/month
  - 10GB hosting storage
  - 360MB/day transfer
- **Cloud Scheduler**: ~$0.10/month (required for scheduled functions)
- **Most sites stay within free tier**

#### Stripe
- No monthly fees
- 2.9% + 30¢ per US card transaction

#### EmailJS
- Free tier: 200 emails/month
- Paid: $15/month for 1,000 emails

**Estimated monthly cost**: ~$0.10 (if within free tiers)

---

## Command Reference

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

# Start React development server
npm start

# Build functions (TypeScript compilation)
cd functions && npm run build
```

### Environment Configuration

```bash
# Create environment files
cp .env.example .env
cp functions/.env.example functions/.env.local

# Set Firebase secrets (production)
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set NOTION_TOKEN
firebase functions:secrets:set NOTION_ONLINE_ORDERS_DATABASE_ID
firebase functions:secrets:set EMAILJS_SERVICE_ID
firebase functions:secrets:set EMAILJS_PUBLIC_KEY
firebase functions:secrets:set EMAILJS_SHIPPED_TEMPLATE_ID
firebase functions:secrets:set EMAILJS_DELIVERED_TEMPLATE_ID

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

# Deploy specific function
firebase deploy --only functions:checkOrderStatusUpdates
```

### Monitoring & Debugging

```bash
# View function logs
firebase functions:log

# View function logs (streaming)
firebase functions:log --follow

# View specific function logs
firebase functions:log --only checkOrderStatusUpdates

# List Firebase projects
firebase projects:list

# Check current project
firebase use
```

### Stripe CLI

```bash
# Install Stripe CLI (macOS)
brew install stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local emulator
stripe listen --forward-to http://127.0.0.1:5001/PROJECT_ID/us-central1/api/webhook
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

---

## File Structure

```
├── functions/              # Firebase Functions
│   ├── src/
│   │   └── index.ts       # Main function code
│   ├── lib/               # Compiled output
│   ├── .env.local         # Local secrets (gitignored)
│   ├── .env.example       # Environment template
│   └── package.json
├── src/                   # React app
│   ├── components/
│   │   ├── EmbeddedCheckout.tsx
│   │   ├── ShippingSelector.tsx
│   │   └── ...
│   ├── services/
│   │   ├── stripeService.ts
│   │   ├── notionService.ts
│   │   └── emailService.ts
│   ├── pages/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── order-confirmation/
│   │   └── ...
│   └── ...
├── build/                 # Production build
├── .env                   # Frontend config (gitignored)
├── .env.example           # Frontend template
├── firebase.json          # Firebase config
└── package.json           # Root dependencies
```

---

## Additional Resources

### Documentation
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Firebase Functions](https://firebase.google.com/docs/functions)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Notion API](https://developers.notion.com/)
- [EmailJS Documentation](https://www.emailjs.com/docs/)

### Support
- [Stripe Support](https://support.stripe.com)
- [Firebase Support](https://firebase.google.com/support)
- [Notion Support](https://www.notion.so/help)

---

## Summary

You now have a complete e-commerce solution with:

✅ **Embedded Stripe Checkout** - Seamless payment experience without leaving your site  
✅ **Notion Order Tracking** - Centralized order management in Notion database  
✅ **Notion Inventory Management** - Dynamic product catalog managed in Notion  
✅ **Automated Email Notifications** - Customer updates on shipping/delivery  
✅ **Flexible Shipping Options** - Local pickup and multiple shipping speeds  
✅ **Secure Backend** - All sensitive operations server-side  
✅ **Production Ready** - Scalable Firebase infrastructure  

### Tech Stack Summary

**Frontend:**
- React with TypeScript
- Stripe Elements for embedded checkout
- Real-time inventory fetching from Notion

**Backend:**
- Firebase Functions (Node.js/TypeScript)
- Stripe API for payment processing
- Notion API for order and inventory management
- EmailJS for email notifications
- Cloud Scheduler for automated tasks

**Infrastructure:**
- Firebase Hosting (static site)
- Firebase Functions (serverless backend)
- Firebase Cloud Scheduler (automated notifications)
- Stripe (payment processing)
- Notion (data management)
- EmailJS (email service)

### Key Features

1. **Dynamic Inventory**: Manage products in Notion without code changes
2. **Type-Specific Properties**: Coffee and merchandise have different attributes
3. **Real-time Updates**: Changes in Notion reflect immediately in the shop
4. **Automated Workflows**: Scheduled functions check for order status changes
5. **Duplicate Prevention**: Checkbox tracking prevents repeated emails
6. **Fallback System**: Sample data loads if Notion is unavailable
7. **Secure Payments**: Stripe handles PCI compliance
8. **Flexible Shipping**: Multiple options including local pickup

### Cost Breakdown

**Monthly Costs (within free tiers):**
- Firebase Hosting: FREE (10GB storage)
- Firebase Functions: FREE (2M invocations/month)
- Cloud Scheduler: ~$0.10/month
- Stripe: 2.9% + 30¢ per transaction (no monthly fee)
- EmailJS: FREE (200 emails/month)

**Estimated monthly cost**: ~$0.10 + transaction fees

### Maintenance Requirements

**Daily:**
- Monitor order fulfillment in Notion
- Update order statuses as needed

**Weekly:**
- Check Firebase logs for errors
- Review EmailJS usage

**Monthly:**
- Review inventory levels in Notion
- Update product information as needed
- Monitor billing and usage

**As Needed:**
- Add new products to Notion inventory
- Update email templates
- Adjust shipping options
- Modify notification triggers

### Next Steps

1. **Complete initial setup** using this guide
2. **Test thoroughly** with sample orders
3. **Deploy to production** with live Stripe keys
4. **Monitor first few orders** to ensure smooth operation
5. **Customize** email templates and branding
6. **Scale** as needed - infrastructure handles growth automatically

**Total setup time**: ~2-3 hours  
**Monthly cost**: ~$0.10 (within free tiers)  
**Maintenance**: Minimal - automated notifications handle customer communication  

For questions or issues, refer to the [Troubleshooting](#troubleshooting) section or check the Firebase/Stripe logs for detailed error messages.
