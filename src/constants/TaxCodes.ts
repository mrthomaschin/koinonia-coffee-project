/**
 * Stripe Product Tax Codes
 * https://docs.stripe.com/tax/tax-codes
 */

export const TaxCodes = {
  /**
   * Whole bean & ground coffee sold online
   * (8 oz bags, 12 oz bags, subscriptions, etc.)
   */
  // Packaged whole-bean/ground coffee intended for consumption off premises.
  COFFEE: 'txcd_40040000', // Food for Non-Immediate Consumption

  /**
   * Shirts, hats, hoodies
   */
  APPAREL: 'txcd_99999999', // General - Tangible Goods

  /**
   * Ceramic mugs, tumblers
   */
  DRINKWARE: 'txcd_99999999', // General - Tangible Goods

  /**
   * Stickers, tote bags, pins, accessories
   */
  MERCH: 'txcd_99999999', // General - Tangible Goods

  /**
   * Fallback
   */
  DEFAULT: 'txcd_99999999',
} as const;

export type TaxCodeType = keyof typeof TaxCodes;
