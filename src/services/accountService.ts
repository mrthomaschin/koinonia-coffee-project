import { Account, Subscription, SubscriptionPlan } from '../models/AccountModel';
import { Order } from '../models/OrderModel';

type AccountProfile = Omit<Account, 'password' | 'orders'>;

interface AuthResponse {
  account: AccountProfile;
  token: string;
}

interface CreateAccountInput {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
}

class AccountService {
  private readonly backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.backendUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  login(username: string, password: string): Promise<AuthResponse> {
    return this.request('/account/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  createAccount(input: CreateAccountInput): Promise<AuthResponse> {
    return this.request('/account/create', { method: 'POST', body: JSON.stringify(input) });
  }

  getOrders(token: string): Promise<{ orders: Order[] }> {
    return this.request('/account/orders', { headers: { Authorization: `Bearer ${token}` } });
  }

  getSubscriptions(token: string): Promise<{ subscriptions: Subscription[] }> {
    return this.request('/account/subscriptions', { headers: { Authorization: `Bearer ${token}` } });
  }

  createSubscription(token: string, plan: SubscriptionPlan): Promise<{ subscription: Subscription }> {
    return this.request('/account/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
  }

  skipSubscription(token: string, subscriptionId: string): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/skip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  completeSubscriptionCheckout(token: string, paymentIntentId: string, subscriptionItems: Array<{ plan: SubscriptionPlan; itemSku: string; itemName: string; weight: string; shippingWeight?: number; unitAmount: number }>, shippingAddress: string, shippingAddressData?: Record<string, unknown>, orderId?: string, customerPhone?: string, isLocalPickup?: boolean, orderPickupId?: string): Promise<{ subscriptionIds: string[] }> {
    return this.request('/account/subscription-checkout/complete', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentIntentId, subscriptionItems, shippingAddress, shippingAddressData, orderId, customerPhone, isLocalPickup, orderPickupId }),
    });
  }

  cancelSubscription(token: string, subscriptionId: string): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  logout(token: string): Promise<void> {
    return this.request('/account/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  }
}

export const accountService = new AccountService();
export type { AccountProfile, CreateAccountInput, AuthResponse };
