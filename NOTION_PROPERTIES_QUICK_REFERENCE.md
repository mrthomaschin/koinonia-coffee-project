# Notion Inventory Database - Quick Property Reference

## Required Properties (All Items)

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

## Coffee-Specific Properties

| Property Name | Type | Example Value | Options |
|--------------|------|---------------|---------|
| Weights | Multi-select | 200g, 5lb | 12oz, 16oz, 24oz, 200g, 5lb |
| Roast Level | Select | "Light" | Light, Medium-Light, Medium, Medium-Dark, Dark |
| Origin | Text | "Ethiopia" | Coffee origin/region |
| Tasting Notes | Multi-select | Bergamot, Jasmine | Any flavor descriptors |

## Merchandise-Specific Properties

| Property Name | Type          | Example Value   | Options                  |
| ---------------| ---------------| -----------------| --------------------------|
| Sizes         | Multi-select  | S, M, L, XL     | S, M, L, XL              |
| Colors        | Multi-select  | Beige, Black    | Any color names          |

## Variant Inventory Properties (Optional - for per-size/color stock tracking)

| Property Name  | Type     | Example Value | Description                                    |
| ----------------| ----------| ---------------| ------------------------------------------------|
| Is Variant     | Checkbox | ✅             | Check if this is a variant (not main product) |
| Parent SKU     | Text     | M-TEE-001     | SKU of parent product (for variants only)     |
| Variant Size   | Select   | M             | Size for this variant (S, M, L, XL)           |
| Variant Color  | Select   | Beige         | Color for this variant                        |
| Variant Weight | Select   | 200g          | Weight for coffee variants (200g, 5lb)        |

## Item Type Values (Exact Match Required)

- `Coffee` - For coffee products
- `Apparel` - For clothing items
- `Drinkware` - For mugs, cups, bottles
- `Accessories` - For misc items
- `Stickers` - For sticker products

## Important Notes

✅ **Property names are case-sensitive** - Must match exactly  
✅ **Active checkbox** - Only checked items appear in shop  
✅ **Item Type** - Must use exact values listed above  
✅ **Images** - Use public URLs or Notion file uploads  
✅ **Coffee items** - Must have Weights, Roast Level, Origin, Tasting Notes  
✅ **Apparel items** - Should have Sizes property filled  
✅ **Variant inventory** - Use for per-size/color stock tracking (see NOTION_VARIANT_INVENTORY_GUIDE.md)  

## Quick Add Checklist

When adding a new item:
- [ ] Name filled
- [ ] SKU is unique
- [ ] Description added
- [ ] Price set (number format)
- [ ] Item Type selected
- [ ] Quantity set
- [ ] At least one image added
- [ ] Active checkbox checked ✅
- [ ] Created At date set
- [ ] Type-specific properties filled (Coffee or Merch)
