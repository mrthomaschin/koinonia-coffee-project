# Notion Variant-Based Inventory Guide

## Problem Statement

You want to track inventory for each size of the "Koinonia Signature Tee" separately (S, M, L, XL), but display it as a single product listing on your website instead of 4 separate listings.

## Solution: Parent-Child Variant System

This system uses a **parent item** (the main product) with **child variants** (individual size/color combinations) to track stock separately while displaying as one product.

---

## Database Structure

### Parent Items (Main Products)

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

### Variant Items (Size/Color Specific)

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

---

## Required Database Properties

### New Properties for Variant System

Add these properties to your existing inventory database:

| Property Name | Type | Description | Required |
|--------------|------|-------------|----------|
| **Is Variant** | Checkbox | Check if this is a variant item | ✅ Yes |
| **Parent SKU** | Text | SKU of parent product (for variants only) | For variants |
| **Variant Size** | Select | Size for this variant | For apparel variants |
| **Variant Color** | Select | Color for this variant | For variants with colors |
| **Variant Weight** | Select | Weight for coffee variants | For coffee variants |

### Variant Size Options
Create these options in the **Variant Size** select:
- `S`
- `M`
- `L`
- `XL`

### Variant Weight Options (for Coffee)
Create these options in the **Variant Weight** select:
- `200g`
- `5lb`

---

## Setup Instructions

### Step 1: Add New Properties

1. Open your inventory database
2. Add the following properties:
   - **Is Variant** (Checkbox)
   - **Parent SKU** (Text)
   - **Variant Size** (Select)
   - **Variant Color** (Select)
   - **Variant Weight** (Select)

### Step 2: Convert Existing Items

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

### Step 3: Test the Setup

1. Refresh your shop page
2. You should see **only one** "Koinonia Signature Tee" listing
3. When customers select a size, the system will check variant inventory
4. Out-of-stock sizes will be disabled automatically

---

## How It Works

### Frontend Behavior

1. **Shop Page**: Shows only parent items (one listing per product)
2. **Product Page**: 
   - Displays all available sizes from parent's "Sizes" property
   - When customer selects a size, checks variant inventory
   - Shows "Out of Stock" if variant quantity = 0
   - Shows available quantity for selected variant

### Backend Processing

1. Fetches all items from database
2. Separates parent items and variants
3. Groups variants by Parent SKU
4. Attaches variant inventory to parent items
5. Returns parent items with embedded variant data

### Data Structure

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

---

## Use Cases

### Apparel with Multiple Sizes
**Example: T-Shirts, Hoodies**
- Parent: "Koinonia Hoodie"
- Variants: S, M, L, XL (each with separate inventory)

### Apparel with Size + Color Combinations
**Example: T-Shirt in Multiple Colors**
- Parent: "Koinonia Tee"
- Variants:
  - S-Beige, M-Beige, L-Beige, XL-Beige
  - S-Black, M-Black, L-Black, XL-Black

### Coffee with Multiple Weights
**Example: Ethiopia Yirgacheffe**
- Parent: "Ethiopia Yirgacheffe"
- Variants:
  - 200g (Quantity: 15)
  - 5lb (Quantity: 3)

---

## Inventory Management

### Adding Stock

1. Find the specific variant row (e.g., "M-TEE-001-M")
2. Update the Quantity field
3. Changes reflect immediately on website

### Checking Stock Levels

Create a Notion view filtered by:
- **Is Variant** = Checked
- **Quantity** < 5 (low stock alert)

### Reordering

Sort variants by:
- Parent SKU (to group by product)
- Variant Size (to see all sizes together)

### Reporting

Create formulas to calculate:
- Total stock per parent: Sum of all variant quantities
- Best-selling sizes: Track which variants sell fastest

---

## Best Practices

### SKU Naming Convention

Use consistent patterns:
- Parent: `M-TEE-001`
- Variants: `M-TEE-001-S`, `M-TEE-001-M`, etc.

For color variants:
- `M-TEE-001-S-BEIGE`
- `M-TEE-001-S-BLACK`

### Variant Naming

Make variant names descriptive:
- ✅ "Koinonia Signature Tee - S"
- ✅ "Koinonia Signature Tee - M - Black"
- ❌ "Variant 1"

### Active Status

- **Parent Active = ✅**: Product shows on shop
- **Variant Active = ✅**: Size is available for selection
- **Variant Active = ❌**: Size is hidden (discontinued)

### Images

- Add images to **parent** item only
- Variants inherit parent images
- For color variants, you can add color-specific images to variants

---

## Migration Checklist

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

---

## Troubleshooting

### Multiple Listings Still Showing

**Issue**: Seeing 4 separate tee listings instead of 1

**Solution**:
1. Verify variants have "Is Variant" = ✅
2. Verify variants have correct "Parent SKU"
3. Check that only parent has "Is Variant" = ❌

### Size Shows as Available but No Stock

**Issue**: Size S is selectable but shows 0 stock

**Solution**:
1. Check variant with Variant Size = "S" has quantity > 0
2. Verify Parent SKU matches exactly (case-sensitive)
3. Ensure variant is Active = ✅

### Variant Not Linking to Parent

**Issue**: Variant exists but not showing in product

**Solution**:
1. Parent SKU must match parent's SKU exactly
2. Check for extra spaces in SKU fields
3. Verify both parent and variant are Active = ✅

---

## Example Database View

Create a filtered view to see variants grouped by parent:

**Filter**: Is Variant = Checked  
**Sort**: Parent SKU (ascending), then Variant Size (ascending)

This shows all variants organized by product, making inventory management easier.

---

**Last Updated**: July 2026
