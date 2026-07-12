# Automated Order Status Notifications Setup Guide

This guide explains how to set up automated email notifications that are sent when order statuses are updated in your Notion database.

## Overview

The system uses a **polling approach** with a Firebase scheduled function that:
- Runs every 10 minutes
- Checks your Notion database for orders with updated fulfillment statuses
- Sends email notifications to customers when orders are marked as "Shipped" or "Delivered"
- Prevents duplicate emails using tracking checkboxes in Notion

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Every 10 minutes:                                          │
│  1. Firebase Scheduler triggers checkOrderStatusUpdates()  │
│  2. Query Notion for orders updated in last 15 minutes     │
│  3. Check if Fulfillment = "Shipped" or "Delivered"        │
│  4. If email not sent yet, send via EmailJS                │
│  5. Mark checkbox in Notion to prevent duplicates           │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

Before setting up automated notifications, ensure you have:

1. ✅ Notion database configured (see `NOTION_SETUP_GUIDE.md`)
2. ✅ EmailJS account with templates created
3. ✅ Firebase Functions deployed or emulator running

## Step 1: Update Notion Database Schema

Add two new checkbox properties to your Notion database:

| Property Name          | Type     | Description                               |
| ------------------------| ----------| -------------------------------------------|
| `Shipped Email Sent`   | Checkbox | Tracks if shipped notification was sent   |
| `Delivered Email Sent` | Checkbox | Tracks if delivered notification was sent |

**How to add:**
1. Open your Notion database
2. Click the **"+"** button to add a new property
3. Name it `Shipped Email Sent`
4. Select **Checkbox** as the type
5. Repeat for `Delivered Email Sent`

## Step 2: Create EmailJS Templates

You need to create two email templates in EmailJS:

### Template 1: Order Shipped Notification

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

**Important:** Use the HTML template provided by the user with these variables.

### Template 2: Order Delivered Notification

**Template Variables (use these exact names in EmailJS):**
- `{{to_email}}` - Customer's email address
- `{{customer_name}}` - Customer's name
- `{{order_id}}` - Order ID (e.g., "ABC12345")
- `{{{items_html}}}` - HTML formatted list of items (use triple braces for HTML)
- `{{delivery_date}}` - Date when order was delivered (e.g., "January 15, 2026")
- `{{delivery_location}}` - Where package was left (default: "Front door")
- `{{review_url}}` - URL for customer to leave a review

**Important:** Use the HTML template provided by the user with these variables.

**Steps to create templates:**
1. Go to [EmailJS Dashboard](https://dashboard.emailjs.com/)
2. Navigate to **Email Templates**
3. Click **Create New Template**
4. Design your email using the variables above
5. Save and copy the **Template ID** (you'll need this for configuration)

## Step 3: Configure Environment Variables

### For Local Development (Emulator)

1. Navigate to the `functions` folder
2. Edit your `functions/.env.local` file (create from `.env.example` if needed):

```bash
# EmailJS Configuration for Automated Notifications
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_PUBLIC_KEY=your_public_key_here
EMAILJS_SHIPPED_TEMPLATE_ID=template_xxxxxxx
EMAILJS_DELIVERED_TEMPLATE_ID=template_yyyyyyy
```

**Where to find these values:**
- **Service ID**: EmailJS Dashboard → Email Services → Your Service
- **Public Key**: EmailJS Dashboard → Account → General
- **Template IDs**: EmailJS Dashboard → Email Templates → Your Template

3. Restart your Firebase emulator after updating the file

### For Production Deployment

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

## Step 4: Deploy the Scheduled Function

### For Local Testing (Emulator)

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

### For Production Deployment

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

## Step 5: Test the System

### Test Workflow

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

### Monitoring

Check Firebase logs to monitor the scheduled function:

```bash
# View logs in real-time
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

## Troubleshooting

### No emails are being sent

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

### Duplicate emails being sent

**Cause:** Tracking checkboxes aren't being updated in Notion

**Fix:**
1. Verify your Notion integration has **write permissions** to the database
2. Check that property names match exactly: `Shipped Email Sent` and `Delivered Email Sent`
3. Manually check the boxes to stop duplicate sends

### Function not running on schedule

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

### EmailJS rate limits

**Free tier limits:**
- 200 emails/month
- 2 email templates

**If you exceed limits:**
- Upgrade to EmailJS paid plan ($15/month for 1,000 emails)
- Or switch to SendGrid/Mailgun (see recommendations in main README)

## Customization

### Change notification triggers

Edit `functions/src/index.ts` to add more status triggers:

```typescript
// Add "Processing" notification
if (fulfillmentStatus === "Processing" && !processingEmailSent && processingTemplateId) {
  // Send processing email
}
```

### Change polling frequency

Edit the schedule in `functions/src/index.ts`:

```typescript
const schedulerOptions: any = {
  schedule: "every 5 minutes",  // Change from 10 to 5 minutes
  timeZone: "America/Los_Angeles",
};
```

**Note:** More frequent polling = more function invocations (still free within limits)

### Add more email variables

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

## Security Notes

- ✅ EmailJS credentials are stored as Firebase secrets in production
- ✅ Never commit `.env.local` files to version control
- ✅ Notion API calls are made from backend (secure)
- ✅ Customer emails are only sent to addresses in your database

## Next Steps

Once automated notifications are working:

1. **Monitor email deliverability** - Check spam rates in EmailJS dashboard
2. **Customize email templates** - Add branding, tracking links, etc.
3. **Add more triggers** - Processing, Refunded, etc.
4. **Consider upgrading email service** - For higher volume, use SendGrid/Mailgun

## Support

If you encounter issues:
1. Check Firebase Functions logs
2. Verify EmailJS dashboard for send errors
3. Review Notion integration permissions
4. Ensure all environment variables are set correctly
