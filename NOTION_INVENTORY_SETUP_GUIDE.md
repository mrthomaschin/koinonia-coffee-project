# Notion Inventory Database Setup Guide

This guide will help you set up a Notion database to manage your shop inventory, replacing the static `shopData.ts` file.

## Overview

The inventory system fetches product data from a Notion database in real-time, allowing you to manage your shop items without code changes. The system supports both coffee products and merchandise with their specific attributes.

### Variant Inventory System

For products with multiple sizes or colors (like t-shirts), you can track inventory per variant while displaying as a single product. See **NOTION_VARIANT_INVENTORY_GUIDE.md** for detailed instructions on setting up variant-based inventory tracking.

## Prerequisites

1. A Notion account
2. An existing Notion integration (if you already set one up for orders, you can reuse it)
3. Access to your Firebase Functions environment variables

## Step 1: Create the Notion Integration (if not already done)

1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Name it (e.g., "Koinonia Coffee Shop")
4. Select your workspace
5. Click **"Submit"**
6. Copy the **Internal Integration Token** (starts with `secret_`)
7. Save this token - you'll need it for `NOTION_TOKEN`

## Step 2: Create the Inventory Database

### Create a New Database

1. In Notion, create a new page
2. Type `/database` and select **"Table - Full page"**
3. Name it **"Shop Inventory"** or similar

### Add Required Properties

Create the following properties in your database. **Property names must match exactly** (case-sensitive):

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

### Configure Select Options

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

## Step 3: Share Database with Integration

1. Open your **Shop Inventory** database in Notion
2. Click the **"•••"** menu in the top right
3. Scroll down and click **"+ Add connections"**
4. Select your integration (e.g., "Koinonia Coffee Shop")
5. Click **"Confirm"**

## Step 4: Get the Database ID

1. Open your **Shop Inventory** database in Notion
2. Look at the URL in your browser. It will look like:
   ```
   https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID
   ```
3. Copy the **DATABASE_ID** (32-character string between the last `/` and the `?`)
4. Save this ID - you'll need it for `NOTION_INVENTORY_DATABASE_ID`

## Step 5: Configure Environment Variables

### For Local Development (Emulator)

1. Open `functions/.env.local` (create if it doesn't exist)
2. Add or update:
   ```env
   NOTION_TOKEN=secret_your_actual_token_here
   NOTION_INVENTORY_DATABASE_ID=your_actual_database_id_here
   ```

### For Production (Firebase)

Set the secret using Firebase CLI:

```bash
firebase functions:secrets:set NOTION_INVENTORY_DATABASE_ID
```

When prompted, paste your database ID.

If you haven't already set the Notion token:
```bash
firebase functions:secrets:set NOTION_TOKEN
```

## Step 6: Add Sample Data

Add a few test items to verify the setup:

### Example Coffee Item

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

### Example Merchandise Item

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

## Step 7: Test the Integration

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

## Troubleshooting

### Items Not Showing Up

1. **Check Active checkbox**: Only items with `Active = ✅` are displayed
2. **Verify database sharing**: Ensure the database is shared with your integration
3. **Check property names**: Property names are case-sensitive and must match exactly
4. **Review console logs**: Check browser console and Firebase logs for errors

### Images Not Loading

1. **Use public URLs**: Image URLs must be publicly accessible
2. **Notion file uploads**: Notion-hosted images work but URLs expire after some time
3. **Recommended**: Use a CDN or cloud storage (Firebase Storage, Cloudinary, etc.)

### Missing Properties Error

If you see errors about missing properties:
1. Verify all required properties exist in your database
2. Check that property names match exactly (case-sensitive)
3. Ensure the property types are correct

### Fallback to Sample Data

If the system can't fetch from Notion, it will automatically fall back to the sample data in `shopData.ts` and show a warning message. This ensures your shop remains functional even if Notion is temporarily unavailable.

## Managing Inventory

### Adding New Items

1. Open your Notion inventory database
2. Click **"+ New"** to add a row
3. Fill in all required properties
4. Check the **Active** checkbox
5. Save - the item will appear in your shop immediately (may take a few seconds to refresh)

### Updating Items

1. Edit any property in Notion
2. Changes appear in the shop on next page load
3. To temporarily hide an item, uncheck **Active**

### Removing Items

1. Uncheck the **Active** checkbox to hide from shop
2. Or delete the row entirely

## Image Management Best Practices

1. **Use consistent dimensions**: Recommended 800x800px or 1200x1200px
2. **Optimize file sizes**: Compress images before uploading
3. **Use external hosting**: For production, host images on:
   - Firebase Storage
   - Cloudinary
   - AWS S3
   - Any CDN with public URLs

4. **Multiple images**: Add multiple files to the Images property for product galleries

## Production Deployment

Before deploying to production:

1. ✅ Set all Firebase secrets:
   ```bash
   firebase functions:secrets:set NOTION_TOKEN
   firebase functions:secrets:set NOTION_INVENTORY_DATABASE_ID
   ```

2. ✅ Test thoroughly with real product data
3. ✅ Ensure all images are on reliable hosting
4. ✅ Set up proper Notion workspace permissions
5. ✅ Deploy functions:
   ```bash
   firebase deploy --only functions
   ```

## API Endpoint

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

## Support

If you encounter issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Check browser console for frontend errors
3. Verify Notion integration permissions
4. Ensure all environment variables are set correctly

---

**Last Updated**: July 2026
