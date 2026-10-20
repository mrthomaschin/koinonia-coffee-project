import React, {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { CartItem } from "./CartViewModel";
import { ItemType, getThumbnailUrl } from "../shop/item/ItemModel";
import { useCart } from "../../contexts/CartContext";
import { useAccount } from "../../contexts/AccountContext";
import {
  CheckoutError,
  CheckoutLine,
  CheckoutQuote,
  stripeService,
} from "../../services/stripeService";
import { validateDiscountCode } from "../../services/discountService";
import {
  clearPendingDiscountCode,
  getPendingDiscountCode,
} from "../../services/newsletterService";
import EmbeddedCheckout from "../../components/EmbeddedCheckout";
import { ShippingOption } from "../../components/ShippingSelector";
import "./Cart.css";
import { createLogger } from "../../util/logger";
import { allowsUnlimitedPurchases } from "../../util/limitedTimeOffer";

const logger = createLogger("CartView");

// Free shipping threshold
const FREE_SHIPPING_THRESHOLD = 40;

interface CartViewProps {
  availableHeight: number;
}

const CartView: React.FC<CartViewProps> = ({ availableHeight }) => {
  const navigate = useNavigate();
  const { cart: viewModel, forceUpdate, showToast } = useCart();
  const { account, isAuthenticated, token } = useAccount();
  const [pendingQuantities, setPendingQuantities] = useState<{
    [key: number]: number;
  }>({});
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  // The server's price when checkout opened: items and discount, before shipping and tax.
  const [checkoutQuote, setCheckoutQuote] = useState<CheckoutQuote | null>(
    null,
  );
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  const subtotal = useMemo(
    () => viewModel.getSubtotal(),
    [viewModel.cartItems, updateTrigger],
  );
  const discountAmount = useMemo(
    () => viewModel.getDiscountAmount(),
    [viewModel.discountCode, subtotal],
  );
  const subtotalAfterDiscount = useMemo(
    () => viewModel.getSubtotalAfterDiscount(),
    [viewModel.discountCode, subtotal],
  );
  const isEmpty = useMemo(
    () => viewModel.cartItems.length === 0,
    [viewModel.cartItems, updateTrigger],
  );
  const qualifiesForFreeShipping = useMemo(
    () => subtotalAfterDiscount >= FREE_SHIPPING_THRESHOLD,
    [subtotalAfterDiscount],
  );
  const isPartnerAccount =
    account?.label === "wholesale" || account?.label === "church-ministry";
  const qualifiesForAccountFreeShipping =
    qualifiesForFreeShipping && !isPartnerAccount;
  const getInternalQuantity = (cartItem: CartItem): number => {
    if (
      !getCheckoutSku(cartItem).endsWith("-WS") ||
      cartItem.item.itemType !== ItemType.coffee
    )
      return cartItem.quantity;
    const weight = Number.parseFloat(cartItem.selections.weight || "");
    return Number.isFinite(weight) && weight > 0
      ? weight * cartItem.quantity
      : cartItem.quantity;
  };
  const getCheckoutSku = (cartItem: CartItem): string => {
    if (cartItem.variantSku) return cartItem.variantSku;
    if (isPartnerAccount && cartItem.selections.subscriptionPlan) {
      const partnerVariant = cartItem.item.variants?.find((variant) =>
        variant.sku.endsWith("-WS"),
      );
      if (partnerVariant) return partnerVariant.sku;
    }
    return cartItem.item.sku;
  };

  const getPendingQuantity = useCallback(
    (index: number) => {
      return (
        pendingQuantities[index] ?? viewModel.cartItems[index]?.quantity ?? 1
      );
    },
    [pendingQuantities, viewModel.cartItems],
  );

  const handleQuantityInputChange = useCallback(
    (index: number, delta: number) => {
      setPendingQuantities((prev) => {
        const currentPending =
          prev[index] ?? viewModel.cartItems[index]?.quantity ?? 1;
        const newQuantity = Math.max(0, currentPending + delta);
        return { ...prev, [index]: newQuantity };
      });
    },
    [viewModel.cartItems],
  );

  const hasAnyChanges = useMemo(() => {
    return viewModel.cartItems.some((item, index) => {
      const pending = pendingQuantities[index];
      return pending !== undefined && pending !== item.quantity;
    });
  }, [viewModel.cartItems, pendingQuantities]);

  const handleUpdateCart = useCallback(() => {
    let hasErrors = false;
    const updates: Array<{ index: number; quantity: number; name: string }> =
      [];
    let removedCount = 0;
    let updatedCount = 0;

    viewModel.cartItems.forEach((cartItem, index) => {
      const newQuantity = pendingQuantities[index] ?? cartItem.quantity;
      if (newQuantity !== cartItem.quantity) {
        let availableQuantity = cartItem.item.quantity;
        if (
          cartItem.variantSku &&
          cartItem.item.variants &&
          cartItem.item.variants.length > 0
        ) {
          const variant = cartItem.item.variants.find(
            (v) => v.sku === cartItem.variantSku,
          );
          if (variant) {
            availableQuantity = variant.quantity;
          }
        }
        // Only validate stock if trying to increase quantity (and not removing item)
        if (
          newQuantity > cartItem.quantity &&
          newQuantity > availableQuantity &&
          !allowsUnlimitedPurchases(cartItem.item)
        ) {
          showToast(
            `${cartItem.item.name}: Only ${availableQuantity} available in stock`,
            "error",
          );
          hasErrors = true;
        } else {
          updates.push({
            index,
            quantity: newQuantity,
            name: cartItem.item.name,
          });
          if (newQuantity === 0) {
            removedCount++;
          } else {
            updatedCount++;
          }
        }
      }
    });

    if (hasErrors) return;

    // Process updates in reverse order to handle index shifting when removing items
    updates.reverse().forEach(({ index, quantity }) => {
      viewModel.updateQuantity(index, quantity);
    });

    setPendingQuantities({});
    setUpdateTrigger((prev) => prev + 1);
    forceUpdate();

    // Show appropriate success message
    if (removedCount > 0 && updatedCount > 0) {
      showToast(
        `Cart updated: ${updatedCount} item(s) updated, ${removedCount} item(s) removed`,
        "success",
      );
    } else if (removedCount > 0) {
      showToast(`${removedCount} item(s) removed from cart`, "success");
    } else if (updatedCount > 0) {
      showToast(`${updatedCount} item(s) updated`, "success");
    }
  }, [viewModel, forceUpdate, showToast, pendingQuantities]);

  const handleContinueShopping = useCallback(() => {
    navigate("/shop");
  }, [navigate]);

  // What the discount rules need to know about the cart: subscriptions and partner pricing can't be combined with some codes.
  // The cart as the server prices it.
  const checkoutLines = useCallback(
    (): CheckoutLine[] =>
      viewModel.cartItems.map((item) => ({
        sku: getCheckoutSku(item),
        quantity: item.quantity,
        ...(item.selections.subscriptionPlan
          ? { subscriptionPlan: item.selections.subscriptionPlan }
          : {}),
        ...(item.selections.isPartnerOrder ? { isPartnerOrder: true } : {}),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewModel.cartItems, isPartnerAccount],
  );

  const discountCartLines = useCallback(
    () =>
      viewModel.cartItems.map((item) => ({
        subscriptionPlan: item.selections.subscriptionPlan || "",
        isPartnerOrder: !!item.selections.isPartnerOrder,
      })),
    [viewModel.cartItems],
  );

  const handleApplyDiscount = useCallback(async () => {
    if (!discountCodeInput.trim()) {
      showToast("Please enter a discount code", "error");
      return;
    }

    setIsValidatingDiscount(true);
    try {
      const data = await validateDiscountCode(
        { code: discountCodeInput.trim(), items: discountCartLines() },
        token,
      );

      if (data.valid && data.code && data.percentOff) {
        viewModel.setDiscountCode(data.code, data.percentOff);
        setUpdateTrigger((prev) => prev + 1);
        forceUpdate();
        showToast(data.message, "success");
      } else {
        showToast(data.message, "error");
      }
    } catch (error) {
      logger.error("[discount] Error validating discount code:", error);
      showToast("Failed to validate discount code. Please try again.", "error");
    } finally {
      setIsValidatingDiscount(false);
    }
  }, [
    discountCodeInput,
    discountCartLines,
    token,
    viewModel,
    forceUpdate,
    showToast,
  ]);

  // Removes a code that no longer applies and tells the customer why. A
  // newsletter code saved for auto-apply is forgotten too, so it isn't
  // applied again; it's still in their welcome email.
  const dropDiscountCode = useCallback(
    (message: string) => {
      if (viewModel.discountCode?.code === getPendingDiscountCode()) {
        clearPendingDiscountCode();
      }
      viewModel.clearDiscountCode();
      setDiscountCodeInput("");
      setUpdateTrigger((prev) => prev + 1);
      forceUpdate();
      showToast(`${message} The code was removed from your cart.`, "error");
    },
    [viewModel, forceUpdate, showToast],
  );

  // Applies the code a new newsletter subscriber was shown, once per cart and
  // sign-in state. It's validated like a typed code. If the buyer has ordered
  // before, they're told why and the code is forgotten; if it doesn't apply
  // for a reason that can change (like a subscription in the cart), the cart
  // is left as is and it's tried again later.
  const autoApplyAttempt = useRef("");
  useEffect(() => {
    const pending = getPendingDiscountCode();
    if (!pending || viewModel.discountCode || !viewModel.cartItems.length) {
      return;
    }
    const attempt = `${pending}|${viewModel.cartItems.length}|${token || ""}`;
    if (autoApplyAttempt.current === attempt) return;
    autoApplyAttempt.current = attempt;
    validateDiscountCode({ code: pending, items: discountCartLines() }, token)
      .then((result) => {
        if (!result.valid && result.reason === "first-order") {
          clearPendingDiscountCode();
          showToast(
            `Your newsletter code ${pending} is for first orders only, so it wasn't applied.`,
            "info",
          );
          return;
        }
        if (
          !result.valid ||
          !result.code ||
          !result.percentOff ||
          viewModel.discountCode
        ) {
          return;
        }
        viewModel.setDiscountCode(result.code, result.percentOff);
        setUpdateTrigger((prev) => prev + 1);
        forceUpdate();
        showToast(
          `Your newsletter code ${result.code} was applied.`,
          "success",
        );
      })
      .catch((error) =>
        logger.error("[discount] Could not apply newsletter code:", error),
      );
  }, [
    discountCartLines,
    forceUpdate,
    showToast,
    token,
    viewModel,
    viewModel.cartItems,
    viewModel.discountCode,
  ]);

  const handleRemoveDiscount = useCallback(() => {
    if (viewModel.discountCode?.code === getPendingDiscountCode()) {
      clearPendingDiscountCode();
    }
    viewModel.clearDiscountCode();
    setDiscountCodeInput("");
    setUpdateTrigger((prev) => prev + 1);
    forceUpdate();
    showToast("Discount code removed", "success");
  }, [viewModel, forceUpdate, showToast]);

  const handleCheckout = useCallback(async () => {
    if (
      viewModel.cartItems.some((item) => item.selections.subscriptionPlan) &&
      !isAuthenticated
    ) {
      showToast(
        "Please sign in or create an account before checking out with a subscription.",
        "error",
      );
      return;
    }
    if (hasAnyChanges) {
      showToast(
        "Please update your cart before proceeding to checkout",
        "error",
      );
      return;
    }

    setIsLoadingCheckout(true);
    try {
      // The cart may have changed since the code was applied, so check it still applies.
      if (viewModel.discountCode) {
        const check = await validateDiscountCode(
          { code: viewModel.discountCode.code, items: discountCartLines() },
          token,
        );
        if (!check.valid) {
          dropDiscountCode(check.message);
          return;
        }
      }

      // Store cart items for tax calculation in embedded checkout
      try {
        // Include item shippingWeight and variants array with shippingWeight for shipping calculation
        const cartItemsWithVariants = viewModel.cartItems.map((item) => ({
          ...item,
          item: {
            ...item.item,
            shippingWeight: item.item.shippingWeight,
            variants: item.item.variants?.map((v) => ({
              ...v,
              shippingWeight: v.shippingWeight,
            })),
          },
        }));
        localStorage.setItem(
          "checkout_cart_items",
          JSON.stringify(cartItemsWithVariants),
        );
        logger.log("[checkout] Stored cart items with shipping weights:", {
          items: cartItemsWithVariants.map((item) => ({
            sku: item.item.sku,
            shippingWeight: item.item.shippingWeight,
            variantSku: item.variantSku,
            hasVariants: !!item.item.variants,
            quantity: getInternalQuantity(item),
          })),
        });
      } catch (storageError) {
        logger.error(
          "localStorage access failed (possibly Safari ITP):",
          storageError,
        );
        // Continue without localStorage - checkout will use fallback
      }

      // Clear any existing clientSecret to force fresh PaymentIntent
      setClientSecret(null);

      // The server prices the cart; the amount shown here is never sent.
      const created = await stripeService.createPaymentIntent(
        checkoutLines(),
        viewModel.discountCode?.code || null,
        token,
      );

      logger.log("[checkout] Payment intent created successfully");
      setClientSecret(created.clientSecret);
      setPaymentIntentId(created.paymentIntentId);
      setCheckoutQuote(created.quote);
      setShowCheckout(true);
    } catch (error) {
      logger.error("[checkout] Error creating payment intent:", error);
      if (error instanceof CheckoutError && error.discountRejected) {
        dropDiscountCode(error.message);
        return;
      }
      showToast(
        error instanceof Error && error.message
          ? error.message
          : "Failed to initialize checkout. Please try again.",
        "error",
      );
    } finally {
      setIsLoadingCheckout(false);
    }
  }, [
    checkoutLines,
    discountCartLines,
    dropDiscountCode,
    forceUpdate,
    getInternalQuantity,
    hasAnyChanges,
    isAuthenticated,
    showToast,
    token,
    viewModel,
    viewModel.cartItems,
    viewModel.discountCode,
  ]);

  const handleCheckoutSuccess = useCallback(
    async (
      paymentIntentId?: string,
      shippingOption?: ShippingOption,
      email?: string,
      name?: string,
      phone?: string,
      shipmentData?: any,
      shippingAddress?: string,
      tax?: number,
      shippingAddressData?: any,
      orderPickupId?: string,
      billingAddress?: string,
      quote?: CheckoutQuote,
    ) => {
      logger.log(
        "CartView handleCheckoutSuccess called with shippingAddress:",
        shippingAddress,
      );
      setShowCheckout(false);
      setClientSecret(null);
      setPaymentIntentId(null);
      setCheckoutQuote(null);

      const customerEmail = email || "customer@example.com";
      const hasSubscription = viewModel.cartItems.some(
        (item) => !!item.selections.subscriptionPlan,
      );
      const accountName = account
        ? `${account.user.firstName} ${account.user.lastName}`.trim()
        : "";
      const customerName =
        hasSubscription && accountName
          ? accountName
          : name || "Valued Customer";
      const customerPhone = phone || "";

      logger.log("Payment successful:", {
        paymentIntentId,
        customerEmail,
        customerName,
        customerPhone,
      });

      // The order records what was charged: the server's quote. The cart's own
      // totals are only a fallback.
      const dollars = (cents: number) => cents / 100;
      const orderSubtotal = quote ? dollars(quote.subtotal) : subtotal;
      const orderDiscount = quote
        ? dollars(quote.discount?.amount || 0)
        : discountAmount;
      const shippingCost = quote
        ? dollars(quote.shipping)
        : shippingOption?.price || 0;
      const taxAmount = quote ? dollars(quote.tax) : tax || 0;
      const totalWithShippingAndTax = quote
        ? dollars(quote.total)
        : subtotalAfterDiscount + shippingCost + taxAmount;

      // Store order data before clearing cart
      const orderData = {
        paymentIntentId,
        subscriptionItems: viewModel.cartItems
          .filter((item) => item.selections.subscriptionPlan)
          .map((item) => ({
            plan: item.selections.subscriptionPlan,
            itemSku: getCheckoutSku(item),
            itemName: item.item.name,
            weight: item.selections.weight || "",
            shippingWeight:
              item.selections.variantShippingWeight || item.item.shippingWeight,
            unitAmount: item.variantPrice || viewModel.getItemPrice(item),
          })),
        items: viewModel.cartItems.map((item, index) => ({
          name: item.item.name,
          quantity: item.quantity,
          internalQuantity: getInternalQuantity(item),
          price:
            quote?.lines[index]?.unitPrice ??
            (item.variantPrice || viewModel.getItemPrice(item)),
          sku: getCheckoutSku(item),
          image:
            item.item.firebaseImageUrls?.[0] ||
            "/assets/images/shop_placeholder.png",
          selections: {
            ...item.selections,
            sku: item.variantSku || item.item.sku,
          },
        })),
        subtotal: orderSubtotal,
        discountCode: quote
          ? quote.discount?.code
          : viewModel.discountCode?.code,
        discountPercent: quote
          ? quote.discount?.percentOff
          : viewModel.discountCode?.percentOff,
        discountAmount: orderDiscount,
        subtotalAfterDiscount: orderSubtotal - orderDiscount,
        shipping: shippingCost,
        tax: taxAmount,
        shippingMethod: shippingOption?.label || "Standard Shipping",
        total: totalWithShippingAndTax,
        timestamp: new Date().toISOString(),
        shipmentData: shipmentData || null,
        shippingAddress: shippingAddress || null,
        billingAddress: billingAddress || null,
        shippingAddressData: shippingAddressData || null,
        isLocalPickup: shippingOption?.id === "local-pickup" || false,
        orderPickupId: orderPickupId || null,
      };

      // A newsletter code that was used on this order is done.
      if (
        orderData.discountCode &&
        orderData.discountCode === getPendingDiscountCode()
      ) {
        clearPendingDiscountCode();
      }
      viewModel.cartItems = [];
      viewModel.clearDiscountCode();
      forceUpdate();
      showToast("Payment successful! Thank you for your purchase.", "success");

      // Navigate with order data in state
      navigate("/order-confirmation", {
        state: {
          orderData,
          fromEmbeddedCheckout: true,
          customerEmail,
          customerName,
          customerPhone,
        },
      });
    },
    [
      account,
      viewModel,
      forceUpdate,
      showToast,
      navigate,
      subtotal,
      subtotalAfterDiscount,
      discountAmount,
    ],
  );

  const handleCheckoutCancel = useCallback(() => {
    setShowCheckout(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setCheckoutQuote(null);
  }, []);

  // The code was refused at payment (for example, the email has ordered
  // before). Close checkout and remove it so the customer can check out again.
  const handleDiscountRejected = useCallback(
    (message: string) => {
      handleCheckoutCancel();
      dropDiscountCode(`${message} Please check out again.`);
    },
    [dropDiscountCode, handleCheckoutCancel],
  );

  const formatWeight = (weight: string): string => {
    return weight;
  };

  const renderCartItem = (cartItem: CartItem, index: number) => {
    const itemPrice = viewModel.getItemPrice(cartItem);
    const itemTotal = itemPrice * cartItem.quantity;
    const pendingQty = getPendingQuantity(index);
    const imageUrl = getThumbnailUrl(cartItem.item);

    return (
      <div key={index} className="cart-item">
        <div className="cart-item-image">
          <img src={imageUrl} alt={cartItem.item.name} />
        </div>

        <div className="cart-item-details">
          <h3 className="cart-item-name">{cartItem.item.name}</h3>

          {cartItem.item.itemType === ItemType.coffee &&
            cartItem.selections.weight && (
              <p className="cart-item-selection">
                Weight: {formatWeight(cartItem.selections.weight)}
              </p>
            )}
          {cartItem.selections.subscriptionPlan && (
            <p className="cart-item-selection">
              Subscription:{" "}
              {cartItem.selections.subscriptionPlan.includes("every-third")
                ? "every third roast"
                : cartItem.selections.subscriptionPlan.includes("every-other")
                  ? "every other roast"
                  : "every roast"}
              {!isPartnerAccount && " · Save 5%"}
            </p>
          )}

          {cartItem.selections.size && (
            <p className="cart-item-selection">
              Size: {cartItem.selections.size}
            </p>
          )}

          <p className="cart-item-price">${itemPrice.toFixed(2)} each</p>
          <button
            className="cart-item-remove"
            onClick={() => handleQuantityInputChange(index, -pendingQty)}
          >
            REMOVE
          </button>
        </div>

        <div className="cart-item-quantity">
          <button
            className="quantity-btn"
            onClick={() => handleQuantityInputChange(index, -1)}
            disabled={pendingQty <= 0}
          >
            −
          </button>
          <span className="quantity-value">{pendingQty}</span>
          <button
            className="quantity-btn"
            onClick={() => handleQuantityInputChange(index, 1)}
          >
            +
          </button>
        </div>

        <div className="cart-item-total">
          <p className="item-total-price">${itemTotal.toFixed(2)}</p>
        </div>
      </div>
    );
  };

  if (isEmpty) {
    return (
      <div className="cart-page" style={{ minHeight: availableHeight }}>
        <header className="cart-intro">
          <div>
            <h1>Your cart</h1>
          </div>
        </header>
        <div className="cart-empty">
          <div className="empty-cart-content">
            <p className="empty-cart-message">No items added to cart.</p>
            <button
              className="continue-shopping-btn"
              onClick={handleContinueShopping}
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page" style={{ minHeight: availableHeight }}>
      <header className="cart-intro">
        <div>
          <h1>Your cart</h1>
        </div>
      </header>

      <div className="cart-layout">
        <section className="cart-selection">
          <div className="cart-items-list">
            {viewModel.cartItems.map((cartItem, index) =>
              renderCartItem(cartItem, index),
            )}
          </div>
          <button
            className="continue-shopping-btn-secondary"
            onClick={handleContinueShopping}
          >
            ← CONTINUE SHOPPING
          </button>
        </section>

        <aside className="cart-summary">
          <h2 className="summary-title">Order Summary</h2>
          <div className="discount-code-section">
            <h3>Discount Code</h3>
            {!viewModel.discountCode ? (
              <div className="discount-input-group">
                <input
                  type="text"
                  value={discountCodeInput}
                  onChange={(e) =>
                    setDiscountCodeInput(e.target.value.toUpperCase())
                  }
                  placeholder="Enter code"
                  className="discount-input"
                  disabled={isValidatingDiscount}
                />
                <button
                  onClick={handleApplyDiscount}
                  className="apply-discount-btn"
                  disabled={isValidatingDiscount || !discountCodeInput.trim()}
                >
                  {isValidatingDiscount ? "Validating..." : "Apply"}
                </button>
              </div>
            ) : (
              <div className="discount-applied">
                <div className="discount-info">
                  <span className="discount-code-text">
                    {viewModel.discountCode.code}
                  </span>
                  <span className="discount-percent">
                    ({viewModel.discountCode.percentOff}% off)
                  </span>
                </div>
                <button
                  onClick={handleRemoveDiscount}
                  className="remove-discount-btn"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {qualifiesForAccountFreeShipping && (
            <div className="free-shipping-notice">
              🎉 You qualify for free USPS Ground Advantage shipping!
            </div>
          )}

          <div className="summary-row">
            <span className="summary-label">Subtotal</span>
            <span className="summary-value">${subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row shipping-row">
            <span className="summary-label">Shipping</span>
            <span className="summary-value">Calculated at checkout</span>
          </div>
          {viewModel.discountCode && (
            <>
              <div className="summary-row discount-row">
                <span className="summary-label">
                  Discount ({viewModel.discountCode.code}):
                </span>
                <span className="summary-value discount-value">
                  -${discountAmount.toFixed(2)}
                </span>
              </div>
              <div className="summary-row total-after-discount">
                <span className="summary-label">Subtotal after discount:</span>
                <span className="summary-value">
                  ${subtotalAfterDiscount.toFixed(2)}
                </span>
              </div>
            </>
          )}

          <div className="cart-total-row">
            <span>Total</span>
            <strong>${subtotalAfterDiscount.toFixed(2)}</strong>
          </div>
          <div className="cart-actions">
            {hasAnyChanges && (
              <button className="update-cart-btn" onClick={handleUpdateCart}>
                UPDATE CART
              </button>
            )}
            <button
              className="checkout-btn"
              onClick={handleCheckout}
              disabled={isLoadingCheckout}
            >
              {isLoadingCheckout ? "LOADING..." : "CHECKOUT"}
            </button>
          </div>
        </aside>
      </div>
      <section className="cart-values">
        <article>
          <h3>Need help?</h3>
          <p>Reach us anytime at hello@koinoniacoffeeproject.com.</p>
        </article>
      </section>

      {showCheckout && clientSecret && paymentIntentId && checkoutQuote && (
        <div className="checkout-modal-overlay" onClick={handleCheckoutCancel}>
          <div
            className="checkout-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <EmbeddedCheckout
              clientSecret={clientSecret}
              paymentIntentId={paymentIntentId}
              checkoutLines={checkoutLines()}
              initialQuote={checkoutQuote}
              totalAmount={
                (checkoutQuote.subtotal -
                  (checkoutQuote.discount?.amount || 0)) /
                100
              }
              onSuccess={handleCheckoutSuccess}
              onCancel={handleCheckoutCancel}
              onDiscountRejected={handleDiscountRejected}
              discountCode={viewModel.discountCode}
              hasSubscription={viewModel.cartItems.some(
                (item) => !!item.selections.subscriptionPlan,
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CartView;
