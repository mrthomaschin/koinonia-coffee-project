# Notion Integration Setup Guide

This guide will help you set up the Notion integration for order tracking in the Koinonia Coffee Project.

## Prerequisites

- A Notion account
- Access to create integrations in Notion

## Step 1: Create a Notion Database

1. Go to Notion and create a new page
2. Add a database (table view recommended)
3. Configure the following properties with exact names and types:

| Property Name      | Type             | Description                                                                 |
| --------------------| ------------------| -----------------------------------------------------------------------------|
| `Customer`         | Title            | Customer's full name                                                        |
| `Order #`          | Rich Text        | Order ID (8-character code)                                                 |
| `Status`           | Status           | Payment status (options: Paid, Pending, Refunded)                           |
| `Fulfillment`      | Status           | Order fulfillment status (options: Pending, Processing, Shipped, Delivered) |
| `Items ordered`    | Rich Text        | List of items with quantities and prices                                    |
| `Email`            | Email            | Customer's email address                                                    |
| `Phone`            | Phone Number     | Customer's phone number                                                     |
| `Shipping address` | Rich Text        | Shipping address                                                            |
| `Transaction ID`   | Rich Text        | Stripe transaction/session ID                                               |
| `Receipt`          | URL              | Link to Stripe dashboard receipt                                            |
| `Total`            | Number           | Order total amount (format as Dollar for currency display)                  |
| `Order created`    | Date             | Timestamp when order was created                                            |
| `Last updated`     | Last Edited Time | Auto-updated by Notion                                                      |

### Status Options Setup

**Status property:**
- Paid (default)
- Pending
- Refunded

**Fulfillment property:**
- Pending (default)
- Processing
- Shipped
- Delivered

## Step 2: Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Fill in the details:
   - **Name**: Koinonia Coffee Orders (or your preferred name)
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
4. Click **"Submit"**
5. Copy the **Internal Integration Token** (starts with `secret_`)
   - This is your `NOTION_TOKEN`

## Step 3: Share Database with Integration

1. Open your Notion database page
2. Click the **"..."** menu in the top right
3. Scroll down and click **"Add connections"**
4. Search for and select your integration (e.g., "Koinonia Coffee Orders")
5. Click **"Confirm"**

## Step 4: Get Database ID

1. Open your Notion database in your browser
2. Copy the URL, which looks like:
   ```
   https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID
   ```
3. Extract the `DATABASE_ID` portion (32-character alphanumeric string)
   - Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
   - This is your `NOTION_ONLINE_ORDERS_DATABASE_ID`

## Step 5: Configure Environment Variables

The Notion integration runs on the **backend (Firebase Functions)** for security, not in the browser.

### For Local Development (Emulator)

1. Navigate to the `functions` folder
2. Create `functions/.env.local` from `functions/.env.example`:
   ```bash
   cp functions/.env.example functions/.env.local
   ```
3. Add your Notion credentials to `functions/.env.local`:
   ```bash
   NOTION_TOKEN=secret_your_actual_integration_token_here
   NOTION_ONLINE_ORDERS_DATABASE_ID=your_actual_database_id_here
   ```
4. Save the file
5. Restart your Firebase emulator if it's running

### For Production Deployment

Use Firebase secrets to securely store credentials:

```bash
# Set Notion integration token
firebase functions:secrets:set NOTION_TOKEN

# Set Notion database ID
firebase functions:secrets:set NOTION_ONLINE_ORDERS_DATABASE_ID
```

When prompted, paste your actual values.

## Step 6: Test the Integration

1. Start your Firebase emulator and development server:
   ```bash
   # Terminal 1: Start Firebase emulator
   firebase emulators:start
   
   # Terminal 2: Start React app
   npm start
   ```

2. Complete a test order through your checkout flow

3. Check your Notion database - you should see a new entry with:
   - Customer information
   - Order details
   - Items ordered
   - Payment status (Paid)
   - Fulfillment status (Pending)
   - Transaction ID and receipt link

## Troubleshooting

### "Notion integration not configured" or "Notion database ID is not configured" error
- Check that both `NOTION_TOKEN` and `NOTION_ONLINE_ORDERS_DATABASE_ID` are set in `functions/.env.local`
- Restart your Firebase emulator after adding environment variables
- For production, ensure secrets are set using `firebase functions:secrets:set`

### "Failed to create Notion order" error
- Verify that your integration has been added to the database (Step 3)
- Check that all property names match exactly (case-sensitive)
- Ensure Status and Fulfillment properties have the correct options configured
- Check the browser console for detailed error messages

### Property type mismatch errors
- Verify that all database properties match the types specified in Step 1
- Property names are case-sensitive and must match exactly

## Security Notes

- **Never commit** `functions/.env.local` to version control (it's gitignored)
- The Notion integration token should be kept secret
- For production, use Firebase secrets (already configured in the code)
- Notion API calls are made from the backend, keeping credentials secure

## Additional Features

The backend includes the `/create-notion-order` endpoint that automatically creates orders in Notion when checkout is completed.

Future enhancements can include:
- Update order status endpoint
- Update fulfillment status endpoint
- Query orders by status
- Webhook integration for automated updates
