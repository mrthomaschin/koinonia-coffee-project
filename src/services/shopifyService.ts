interface ShopifyLineItem {
  variantId: string;
  quantity: number;
}

class ShopifyService {
  private storeDomain: string;
  private storefrontAccessToken: string;
  private apiVersion: string = '2024-01';

  constructor() {
    this.storeDomain = process.env.REACT_APP_SHOPIFY_STORE_DOMAIN || '';
    this.storefrontAccessToken = process.env.REACT_APP_SHOPIFY_STOREFRONT_ACCESS_TOKEN || '';
  }

  async createCheckout(lineItems: ShopifyLineItem[]): Promise<string> {
    if (!this.storeDomain || !this.storefrontAccessToken) {
      throw new Error('Shop Pay credentials not configured. Please set REACT_APP_SHOPIFY_STORE_DOMAIN and REACT_APP_SHOPIFY_STOREFRONT_ACCESS_TOKEN in your .env file.');
    }

    const mutation = `
      mutation checkoutCreate($input: CheckoutCreateInput!) {
        checkoutCreate(input: $input) {
          checkout {
            id
            webUrl
          }
          checkoutUserErrors {
            code
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: lineItems.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity
        })),
        presentmentCurrencyCode: 'USD'
      }
    };

    try {
      const response = await fetch(
        `https://${this.storeDomain}/api/${this.apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': this.storefrontAccessToken,
          },
          body: JSON.stringify({
            query: mutation,
            variables: variables,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      if (data.data.checkoutCreate.checkoutUserErrors.length > 0) {
        const errors = data.data.checkoutCreate.checkoutUserErrors
          .map((err: any) => err.message)
          .join(', ');
        throw new Error(`Checkout errors: ${errors}`);
      }

      const checkoutUrl = data.data.checkoutCreate.checkout.webUrl;

      return checkoutUrl;
    } catch (error) {
      console.error('Error creating Shop Pay checkout:', error);
      throw error;
    }
  }
}

export const shopifyService = new ShopifyService();
