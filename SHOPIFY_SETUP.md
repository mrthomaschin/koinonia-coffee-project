# Shop Pay Checkout Integration

This project is now integrated with Shop Pay for a fast, secure checkout experience using Shopify's Storefront API.

## Setup Instructions

### 1. Create a Shopify Store
If you don't have one already, create a Shopify store at https://www.shopify.com

### 2. Get Your Storefront API Credentials

1. Go to your Shopify Admin
2. Navigate to **Settings** → **Apps and sales channels**
3. Click **Develop apps**
4. Click the link/button to go to **Dev Dashboard** (Shopify's new app development home)
5. In Dev Dashboard, click **Create app**
6. Select your store from the dropdown
7. Name your app (e.g., "Koinonia Coffee Website")
8. Click **Create app**
9. In the app configuration, find the **Storefront API** section
10. Configure the Storefront API access scopes:
    - ✅ `unauthenticated_read_product_listings`
    - ✅ `unauthenticated_write_checkouts`
    - ✅ `unauthenticated_read_checkouts`
11. Click **Save** or **Configure**
12. Click **Install** or **Install on store** to install it on your store
13. After installation, you'll see your **Storefront API access token** - copy this token

### 3. Enable Shop Pay in Your Store

1. In your Shopify Admin, go to **Settings** → **Payments**
2. Under **Shop Pay**, make sure it's enabled
3. Shop Pay is automatically available at checkout for eligible customers
4. Customize Shop Pay settings as needed (branding, installments, etc.)

### 4. Configure Environment Variables

Create or update your `.env` file in the project root:

```env
REACT_APP_SHOPIFY_STORE_DOMAIN=your-store-name.myshopify.com
REACT_APP_SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_access_token_here
```

**Important:** Replace `your-store-name` with your actual Shopify store name and paste your actual access token.

### 5. Add Products to Shopify

1. In your Shopify Admin, go to **Products**
2. Create products matching your items in `src/pages/shop/shopData.ts`
3. For each product variant, copy the **Variant ID**

#### How to Get Variant IDs

You can get variant IDs using the Shopify GraphQL Admin API or by:

1. Going to the product page in Shopify Admin
2. Clicking on a variant
3. Looking at the URL - the variant ID is the number at the end
4. Convert it to the GraphQL format: `gid://shopify/ProductVariant/VARIANT_ID`

Example: If the variant ID is `12345678901`, the GraphQL ID would be:
```
gid://shopify/ProductVariant/12345678901
```

### 6. Update Product Data with Variant IDs

In `src/pages/shop/shopData.ts`, replace the `undefined` values with your Shopify variant IDs:

```typescript
new MerchItem(
  '4',
  'Koinonia Signature Tee',
  'Premium Cotton Tee...',
  32.00,
  ASSETS.shopPlaceholder,
  MerchCategory.apparel,
  new Date(),
  [MerchSize.S, MerchSize.M, MerchSize.L, MerchSize.XL],
  ['Beige'],
  10,
  'gid://shopify/ProductVariant/12345678901' // Replace with your actual variant ID
),
```

### 7. Handling Multiple Variants

For products with multiple variants (e.g., different sizes or weights), you have two options:

#### Option A: Single Default Variant
Use the base product's default variant ID in the item constructor.

#### Option B: Variant-Specific IDs (Recommended for items with options)
Pass the variant ID when adding items to cart with selections:

```typescript
// In your add-to-cart logic
cart.addItem(
  item,
  quantity,
  {
    size: 'M',
    shopifyVariantId: 'gid://shopify/ProductVariant/SIZE_M_VARIANT_ID'
  }
);
```

## How It Works

1. **User adds items to cart** - Items are stored locally with their selections
2. **User clicks "Checkout"** - The cart creates a Shopify checkout session via the Storefront API
3. **Redirect to Shop Pay** - User is redirected to Shopify's checkout page where Shop Pay is available
4. **Fast checkout** - Users can use Shop Pay for one-click checkout (if they have a Shop Pay account) or complete a standard checkout
5. **Order fulfillment** - You manage orders through Shopify Admin

### Shop Pay Benefits

- **Faster checkout**: Shop Pay remembers customer information for one-click purchasing
- **Mobile optimized**: Seamless experience on mobile devices
- **Secure**: Industry-leading security and fraud protection
- **Carbon neutral shipping**: Automatic carbon offset for all orders
- **Shop app integration**: Customers can track orders in the Shop app

## Testing

1. Make sure your `.env` file is configured correctly
2. Add items to your cart
3. Click the "Checkout" button
4. You should be redirected to Shopify's checkout page with your items

## Troubleshooting

### "Shop Pay credentials not configured" error
- Check that your `.env` file exists and has the correct variable names
- Restart your development server after adding environment variables

### "No items with Shopify variant IDs found" error
- Make sure you've added variant IDs to your products in `shopData.ts`
- Verify the variant IDs are in the correct GraphQL format

### "GraphQL errors" or "Checkout errors"
- Verify your Storefront API access token is correct
- Check that the variant IDs exist in your Shopify store
- Ensure the products are published to your sales channel

## Security Notes

- Never commit your `.env` file to version control
- The `.env` file is already in `.gitignore`
- Storefront API tokens are safe to use in client-side code (they have limited permissions)
- Only use the Storefront API access token, NOT your Admin API token

## Additional Resources

- [Shopify Storefront API Documentation](https://shopify.dev/docs/api/storefront)
- [Shopify GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)
- [Creating a Checkout](https://shopify.dev/docs/api/storefront/latest/mutations/checkoutCreate)
