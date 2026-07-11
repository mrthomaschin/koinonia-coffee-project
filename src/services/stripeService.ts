import { loadStripe, Stripe } from '@stripe/stripe-js';
import { CartItem } from '../pages/cart/CartViewModel';

class StripeService {
  private stripePromise: Promise<Stripe | null>;
  private backendUrl: string;

  constructor() {
    const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '';
    this.stripePromise = loadStripe(publishableKey);
    this.backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  }

  async createCheckoutSession(cartItems: CartItem[], tax: number, shipping: number): Promise<void> {
    const stripe = await this.stripePromise;

    if (!stripe) {
      throw new Error('Stripe failed to load. Please check your publishable key.');
    }

    const lineItems = cartItems.map(cartItem => {
      const price = this.calculateItemPrice(cartItem);
      const name = this.getItemName(cartItem);

      return {
        name,
        amount: Math.round(price * 100),
        currency: 'usd',
        quantity: cartItem.quantity,
        images: cartItem.item.images.length > 0 ? [cartItem.item.images[0]] : undefined,
      };
    });

    // Add tax as a line item if greater than 0
    if (tax > 0) {
      lineItems.push({
        name: 'Tax',
        amount: Math.round(tax * 100),
        currency: 'usd',
        quantity: 1,
        images: undefined,
      });
    }

    // Add shipping as a line item if greater than 0
    if (shipping > 0) {
      lineItems.push({
        name: 'Shipping',
        amount: Math.round(shipping * 100),
        currency: 'usd',
        quantity: 1,
        images: undefined,
      });
    }

    try {
      const response = await fetch(`${this.backendUrl}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineItems,
          successUrl: `${window.location.origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/cart`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  async createPaymentIntent(amount: number, metadata?: Record<string, string>): Promise<{ clientSecret: string; paymentIntentId: string }> {
    try {
      const response = await fetch(`${this.backendUrl}/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          currency: 'usd',
          metadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  async retrieveSession(sessionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.backendUrl}/checkout-session/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error retrieving session:', error);
      throw error;
    }
  }

  getStripe(): Promise<Stripe | null> {
    return this.stripePromise;
  }

  private calculateItemPrice(cartItem: CartItem): number {
    return cartItem.item.price;
  }

  private getItemName(cartItem: CartItem): string {
    let name = cartItem.item.name;

    if (cartItem.selections.weight) {
      const weightStr = this.formatWeight(cartItem.selections.weight);
      name += ` - ${weightStr}`;
    }

    if (cartItem.selections.size) {
      name += ` - ${cartItem.selections.size}`;
    }

    return name;
  }

  private formatWeight(weight: number): string {
    const weightMap: { [key: number]: string } = {
      12: '12oz',
      16: '16oz',
      24: '24oz',
      200: '200g',
      80: '5lb',
    };
    return weightMap[weight] || `${weight}oz`;
  }
}

export const stripeService = new StripeService();
