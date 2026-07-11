# Shipping & Local Pickup Options Guide

## Overview

Your embedded checkout now includes **shipping options** with support for:
- ✅ **Local Pickup** (Free)
- ✅ **Standard Shipping** ($8.99)
- ✅ **Express Shipping** ($15.99)
- ✅ **Overnight Shipping** ($24.99)

The shipping selector appears **directly in the checkout modal** - no separate page needed!

## How It Works

### User Experience
1. User clicks "Checkout" in cart
2. Modal appears with **shipping options** at the top
3. User selects shipping method (defaults to Standard)
4. If **Local Pickup** → No address needed
5. If **Shipping** → Address form appears
6. Total updates automatically with shipping cost
7. User completes payment

### Components Created

#### **1. ShippingSelector Component**
- Location: `src/components/ShippingSelector.tsx`
- Radio button interface for shipping options
- Updates total in real-time
- Fully customizable options

#### **2. Updated EmbeddedCheckout**
- Shows subtotal, shipping, and total breakdown
- Conditionally shows address form (hidden for local pickup)
- Uses Stripe's `AddressElement` for shipping addresses
- Passes shipping info to success handler

#### **3. Updated CartView**
- Receives shipping option from checkout
- Calculates total with shipping
- Passes shipping data to order confirmation

## Customizing Shipping Options

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
  // Add more options here...
];
```

### Option Properties
- **id**: Unique identifier (use for logic)
- **label**: Display name
- **price**: Shipping cost in dollars
- **description**: Optional details shown to user

## Features

### ✅ Dynamic Total Calculation
The checkout total updates automatically when shipping changes:
```
Subtotal:  $25.00
Shipping:  $8.99
-----------------
Total:     $33.99
```

### ✅ Conditional Address Collection
- **Local Pickup**: No address form shown
- **Shipping Options**: Stripe AddressElement appears
- Validates address format automatically

### ✅ Order Confirmation
Shipping details are saved and displayed:
- Shipping method selected
- Shipping cost
- Total including shipping

## Styling

### ShippingSelector Styles
Edit `src/components/ShippingSelector.css`:

```css
.shipping-option.selected {
  border-color: #333;  /* Your brand color */
  background: #f5f5f5;
}
```

### Checkout Totals
Edit `src/components/EmbeddedCheckout.css`:

```css
.checkout-totals {
  background: #f9f9f9;  /* Customize background */
  border-radius: 8px;
}
```

## Advanced: Dynamic Shipping Rates

To calculate shipping based on location or weight:

### Option 1: Backend Calculation
```typescript
// In functions/src/index.ts
app.post("/calculate-shipping", async (req, res) => {
  const { zipCode, weight } = req.body;
  
  // Call shipping API (USPS, UPS, FedEx, etc.)
  const rate = await calculateShippingRate(zipCode, weight);
  
  res.json({ rate });
});
```

### Option 2: Stripe Tax & Shipping
Use Stripe's built-in tax and shipping calculation:
- Enable in Stripe Dashboard
- Automatic rate calculation
- Tax compliance included

## Local Pickup Configuration

### Set Pickup Location
Update the description in `ShippingSelector.tsx`:

```typescript
{
  id: 'local-pickup',
  label: 'Local Pickup',
  price: 0,
  description: 'Pick up at 123 Main St, Your City - Free'
}
```

### Pickup Instructions
Add to order confirmation email:
- Pickup address
- Hours of operation
- What to bring (order ID, ID)

## Testing

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

### Test Cards
Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Any future date, any CVC, any ZIP

## Integration with Order System

The shipping data is available in:

### Order Confirmation Page
```typescript
orderData: {
  subtotal: 25.00,
  shipping: 8.99,
  shippingMethod: "Standard Shipping",
  total: 33.99
}
```

### Email Notifications
Pass shipping info to email service:
```typescript
await sendCustomerConfirmation({
  shippingMethod: orderData.shippingMethod,
  shippingCost: orderData.shipping,
  // ... other data
});
```

## Future Enhancements

### 1. Real-Time Shipping Rates
Integrate with:
- USPS API
- UPS API
- FedEx API
- Shippo (multi-carrier)

### 2. International Shipping
Add country-specific options:
```typescript
{
  id: 'international',
  label: 'International Shipping',
  price: 29.99,
  description: '10-14 business days'
}
```

### 3. Free Shipping Threshold
```typescript
const shippingCost = subtotal >= 50 ? 0 : 8.99;
```

### 4. Store Pickup Locations
Multiple pickup locations:
```typescript
{
  id: 'pickup-downtown',
  label: 'Downtown Location',
  price: 0,
  description: '123 Main St'
},
{
  id: 'pickup-mall',
  label: 'Mall Location',
  price: 0,
  description: '456 Shopping Center'
}
```

## Troubleshooting

### Address element not showing
- Check Stripe publishable key is set
- Verify `@stripe/react-stripe-js` is installed
- Check browser console for errors

### Shipping cost not updating
- Verify `onShippingChange` callback is firing
- Check state updates in `EmbeddedCheckout`
- Console.log the selected shipping option

### Total calculation wrong
- Verify shipping price is a number
- Check subtotal calculation
- Ensure no duplicate additions

## Summary

You now have a **complete shipping solution** integrated directly into your checkout:

✅ No separate shipping page needed  
✅ Real-time total updates  
✅ Local pickup option  
✅ Multiple shipping speeds  
✅ Conditional address collection  
✅ Fully customizable options  

The shipping selector keeps everything on one page for a seamless checkout experience!
