import {
  Account,
  AccountLabel,
  SavedAddress,
  SavedAddresses,
  Subscription,
  SubscriptionCadence,
  SubscriptionPlan,
} from "../models/AccountModel";
import { Order } from "../models/OrderModel";

type AccountProfile = Omit<Account, "password" | "orders">;

interface AuthResponse {
  account: AccountProfile;
  token: string;
}

interface CreateAccountResponse extends AuthResponse {
  // False when the account was created but the verification email could not be sent.
  verificationSent: boolean;
}

interface CreateAccountInput {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  label?: AccountLabel;
}

interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  // Required only when the email changes.
  currentPassword?: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Omit a field to leave it unchanged; null removes the saved address.
interface UpdateAddressesInput {
  shippingAddress?: SavedAddress | null;
  billingAddress?: SavedAddress | null;
}

export interface NewsletterPreference {
  id: string;
  name: string;
  description: string;
  subscribed: boolean;
}

interface EmailPreferences {
  reviewRequests: boolean;
  newsletters: NewsletterPreference[];
  // True when turning on a newsletter emailed a confirmation link instead,
  // because the account's email is not verified yet.
  confirmationSent?: boolean;
}

// Omit a field to leave it unchanged. newsletters maps newsletter IDs to on/off.
interface EmailPreferenceChanges {
  reviewRequests?: boolean;
  newsletters?: Record<string, boolean>;
}

class AccountService {
  private readonly backendUrl =
    process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.backendUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Something went wrong. Please try again.");
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }

  login(username: string, password: string): Promise<AuthResponse> {
    return this.request("/account/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  createAccount(input: CreateAccountInput): Promise<CreateAccountResponse> {
    return this.request("/account/create", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getDetails(
    token: string,
  ): Promise<{ account: AccountProfile; addresses: SavedAddresses }> {
    return this.request("/account/details", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // verificationSent is present only when the request asked for a new email.
  updateProfile(
    token: string,
    input: UpdateProfileInput,
  ): Promise<{ account: AccountProfile; verificationSent?: boolean }> {
    return this.request("/account/details", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  }

  verifyEmail(verificationToken: string): Promise<{ account: AccountProfile }> {
    return this.request("/account/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verificationToken }),
    });
  }

  resendVerification(token: string): Promise<{ sentTo: string }> {
    return this.request("/account/verify-email/resend", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  changePassword(
    token: string,
    input: ChangePasswordInput,
  ): Promise<{ signedOutSessions: number }> {
    return this.request("/account/password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  }

  updateAddresses(
    token: string,
    input: UpdateAddressesInput,
  ): Promise<{ addresses: SavedAddresses }> {
    return this.request("/account/addresses", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  }

  getOrders(token: string): Promise<{ orders: Order[] }> {
    return this.request("/account/orders", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /** The review page path for one of the account's delivered orders. */
  getOrderReviewPath(
    token: string,
    orderId: string,
  ): Promise<{ path: string }> {
    return this.request(
      `/account/orders/${encodeURIComponent(orderId)}/review`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
  }

  getEmailPreferences(token: string): Promise<EmailPreferences> {
    return this.request("/account/email-preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  updateEmailPreferences(
    token: string,
    changes: EmailPreferenceChanges,
  ): Promise<EmailPreferences> {
    return this.request("/account/email-preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(changes),
    });
  }

  getSubscriptions(token: string): Promise<{ subscriptions: Subscription[] }> {
    return this.request("/account/subscriptions", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  getPartnerPrices(token: string): Promise<{ prices: Record<string, number> }> {
    return this.request("/account/partner-prices", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  createSubscription(
    token: string,
    plan: SubscriptionPlan,
  ): Promise<{ subscription: Subscription }> {
    return this.request("/account/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
  }

  skipSubscription(
    token: string,
    subscriptionId: string,
  ): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/skip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  unskipSubscription(
    token: string,
    subscriptionId: string,
  ): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/unskip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  changeSubscriptionFrequency(
    token: string,
    subscriptionId: string,
    cadence: SubscriptionCadence,
  ): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/frequency`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cadence }),
    });
  }

  // Charges the saved card now; 'processing' means the charge is still finishing in the background.
  orderSubscriptionNow(
    token: string,
    subscriptionId: string,
  ): Promise<{
    status: "ordered" | "processing";
    orderId?: string;
    subscription: Subscription;
  }> {
    return this.request(`/account/subscriptions/${subscriptionId}/order-now`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  addSubscriptionAddOn(
    token: string,
    subscriptionId: string,
    addOnWeight: number,
    addOnUnitAmount: number,
  ): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/add-on`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ addOnWeight, addOnUnitAmount }),
    });
  }

  completeSubscriptionCheckout(
    token: string,
    paymentIntentId: string,
    subscriptionItems: Array<{
      plan: SubscriptionPlan;
      itemSku: string;
      itemName: string;
      weight: string;
      shippingWeight?: number;
      unitAmount: number;
    }>,
    shippingAddress: string,
    shippingAddressData?: Record<string, unknown>,
    orderId?: string,
    customerPhone?: string,
    isLocalPickup?: boolean,
    orderPickupId?: string,
    orderItems?: Array<{
      name: string;
      sku?: string;
      quantity: number;
      internalQuantity?: number;
      price: number;
      selections?: Record<string, unknown>;
    }>,
    shippingAmount?: number,
    shipmentData?: Record<string, unknown>,
  ): Promise<{ subscriptionIds: string[] }> {
    return this.request("/account/subscription-checkout/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        paymentIntentId,
        subscriptionItems,
        orderItems,
        shippingAddress,
        shippingAddressData,
        orderId,
        customerPhone,
        isLocalPickup,
        orderPickupId,
        shippingAmount,
        shipmentData,
      }),
    });
  }

  cancelSubscription(
    token: string,
    subscriptionId: string,
  ): Promise<{ subscription: Subscription }> {
    return this.request(`/account/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  logout(token: string): Promise<void> {
    return this.request("/account/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export const accountService = new AccountService();
export type {
  AccountProfile,
  CreateAccountInput,
  AuthResponse,
  UpdateProfileInput,
  UpdateAddressesInput,
  ChangePasswordInput,
};
