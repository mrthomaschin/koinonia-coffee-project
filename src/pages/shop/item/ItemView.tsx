import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { Item, ItemType } from './ItemModel';
import { useItemDetailViewModel } from './ItemViewModel';
import { CoffeeBagItem } from './coffee_bag/CoffeeBagItem';
import { MerchItem } from './merch/MerchItem';
import CoffeeBagDetail from './coffee_bag/CoffeeBagDetail';
import MerchDetail from './merch/MerchDetail';
import './ItemView.css';
import { useCart } from '../../../contexts/CartContext';
import { ICONS } from '../../../util/constants';
import { isLimitedTimeOfferAvailable, allowsUnlimitedPurchases } from '../../../util/limitedTimeOffer';
import { useInventory } from '../../../contexts/InventoryContext';
import { generateSlug } from '../shopData';
import SEO, { SITE_URL } from '../../../components/SEO';

interface ItemViewProps {
  availableHeight?: number;
  item?: Item;
  onBack?: () => void;
  renderMetadata?: (item: Item) => React.ReactNode;
  renderExtraInfo?: (item: Item) => React.ReactNode;
  renderOptions?: (item: Item) => React.ReactNode;
  renderDetailsSection?: (item: Item) => React.ReactNode;
  hideDetailsDropdown?: boolean;
  renderBrewingMethod?: (item: Item) => React.ReactNode;
  calculatePrice?: () => string;
  handleAddToCart?: () => void;
  isSoldOut?: boolean;
}

export const ItemView: React.FC<ItemViewProps> = ({
  availableHeight,
  item: itemProp,
  onBack: onBackProp,
  renderMetadata,
  renderExtraInfo,
  renderOptions,
  renderDetailsSection,
  hideDetailsDropdown = false,
  renderBrewingMethod,
  calculatePrice,
  handleAddToCart,
  isSoldOut,
}) => {
  const { cart } = useCart();
  const navigate = useNavigate();
  const { items: inventoryItems } = useInventory();
  const {
    item: viewModelItem,
    isLoading,
    handleBack: viewModelHandleBack,
    isDetailsDropdownOpen,
    toggleDetailsDropdown,
    defaultCalculatePrice,
    defaultHandleAddToCart,
  } = useItemDetailViewModel(itemProp, cart);

  const item = itemProp || viewModelItem;
  const onBack = onBackProp || viewModelHandleBack;
  const relatedItems = item
    ? inventoryItems.filter((relatedItem) => relatedItem.sku !== item.sku).slice(0, 3)
    : [];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const images = item?.firebaseImageUrls && item.firebaseImageUrls.length > 0
    ? item.firebaseImageUrls
    : [ICONS.shopPlaceholder];

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [item]);

  const resetAutoPlayTimer = () => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }
    autoPlayTimerRef.current = setTimeout(() => {
      handleNext();
    }, 10000);
  };

  useEffect(() => {
    if (images.length > 1) {
      resetAutoPlayTimer();
      return () => {
        if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current);
        }
      };
    }
  }, [images.length]);

  const scrollToImage = (index: number) => {
    if (scrollContainerRef.current) {
      const scrollAmount = index * scrollContainerRef.current.offsetWidth;
      scrollContainerRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
      setCurrentImageIndex(index);
      resetAutoPlayTimer();
    }
  };

  const handlePrev = () => {
    const newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : images.length - 1;
    scrollToImage(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentImageIndex < images.length - 1 ? currentImageIndex + 1 : 0;
    scrollToImage(newIndex);
  };

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollPosition = scrollContainerRef.current.scrollLeft;
      const containerWidth = scrollContainerRef.current.offsetWidth;
      const newIndex = Math.round(scrollPosition / containerWidth);
      setCurrentImageIndex(newIndex);
    }
  };

  const getPurchaseStatus = (): { isSoldOut: boolean; buttonText: string } => {
    if (!item) {
      return {
        isSoldOut: true,
        buttonText: 'Sold Out',
      };
    }

    if (isSoldOut !== undefined) {
      return {
        isSoldOut,
        buttonText: isSoldOut ? 'Sold Out' : 'Add to Cart',
      };
    }

    if (!isLimitedTimeOfferAvailable(item)) {
      return {
        isSoldOut: true,
        buttonText: 'Offer Ended',
      };
    }

    // If unlimited purchases is enabled, item is always available regardless of inventory
    if (allowsUnlimitedPurchases(item)) {
      return {
        isSoldOut: false,
        buttonText: 'Add to Cart',
      };
    }

    // Otherwise, check inventory normally
    const isOutOfStock = item.quantity <= 0;
    return {
      isSoldOut: isOutOfStock,
      buttonText: isOutOfStock ? 'Sold Out' : 'Add to Cart',
    };
  };

  if (!item) {
    if (isLoading) {
      return (
        <div className="shop-page" style={{ minHeight: availableHeight }}>
          <div className="shop-header">
            <h1 className="shop-title">Loading...</h1>
          </div>
        </div>
      );
    }
    return (
      <div className="shop-page" style={{ minHeight: availableHeight }}>
        <div className="shop-header">
          <h1 className="shop-title">Item Not Found</h1>
          <button onClick={onBack} className="back-button">
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  const productUrl = `${SITE_URL}/shop/${generateSlug(item.name)}`;
  const productImage = item.firebaseImageUrls?.[0] || `${SITE_URL}${ICONS.shopPlaceholder}`;
  const productStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.itemDetails || item.itemSummary,
    image: item.firebaseImageUrls,
    sku: item.sku,
    url: productUrl,
    brand: { '@type': 'Brand', name: 'Koinonia Coffee Project' },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'USD',
      price: item.price.toFixed(2),
      availability: item.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  const productSeo = <SEO title={`${item.name} | Koinonia Coffee Project`} description={(item.itemDetails || item.itemSummary).slice(0, 160)} path={`/shop/${generateSlug(item.name)}`} image={productImage} structuredData={productStructuredData} />;

  if (!itemProp && availableHeight !== undefined) {
    return (
      <div className="shop-item-page" style={{ minHeight: availableHeight }}>
        {productSeo}
        {item.itemType === ItemType.coffee && (
          <CoffeeBagDetail item={item as CoffeeBagItem} onBack={onBack} />
        )}
        {(item.itemType === ItemType.accessories ||
          item.itemType === ItemType.apparel ||
          item.itemType === ItemType.drinkware ||
          item.itemType === ItemType.stickers) && (
            <MerchDetail item={item as MerchItem} onBack={onBack} />
          )}
      </div>
    );
  }

  return (
    <div className="item-detail-page-wrapper">
      {productSeo}
      <button className="detail-back-button" onClick={onBack}>
        ← BACK TO SHOP
      </button>

      <div className="detail-container">
        <div className="detail-image-section">
          <div className="carousel-container">
            <button
              className="carousel-button carousel-prev"
              onClick={handlePrev}
              disabled={images.length <= 1}
            >
              ‹
            </button>
            <div
              className="carousel-scroll-container"
              ref={scrollContainerRef}
              onScroll={handleScroll}
            >
              {images.map((imageUrl, index) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`${item.name} ${index + 1}`}
                  className="detail-image"
                />
              ))}
            </div>
            <button
              className="carousel-button carousel-next"
              onClick={handleNext}
              disabled={images.length <= 1}
            >
              ›
            </button>
            {images.length > 1 && (
              <div className="carousel-indicators">
                {images.map((_, index) => (
                  <button
                    key={index}
                    className={`carousel-dot ${index === currentImageIndex ? 'active' : ''}`}
                    onClick={() => scrollToImage(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="detail-info-section">
          <div className="detail-header">
            <h1 className="detail-name">{item.name}</h1>
            {renderMetadata && (
              <div className="detail-meta">
                {renderMetadata(item)}
              </div>
            )}
          </div>

          <p className="detail-description">{item.itemDetails}</p>

          {item.itemType === ItemType.coffee && item.nextRoastDate && (
            <p className="next-roast-date">
              Next roast: {new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'America/Los_Angeles',
              }).format(new Date(item.nextRoastDate))}
            </p>
          )}

          {renderExtraInfo && renderExtraInfo(item)}

          {renderOptions && (
            <div className="detail-options">
              {renderOptions(item)}
            </div>
          )}

          <div className={`detail-purchase ${item.itemType === ItemType.coffee ? 'coffee-detail-purchase' : ''}`}>
            <div className="detail-price-section">
              <span className="detail-price-label">Price</span>
              <span className="detail-price">${(calculatePrice || defaultCalculatePrice)()}</span>
            </div>
            <button
              className={`detail-add-to-cart ${getPurchaseStatus().isSoldOut ? 'out-of-stock' : ''}`}
              onClick={handleAddToCart || defaultHandleAddToCart}
              disabled={getPurchaseStatus().isSoldOut}
            >
              {getPurchaseStatus().buttonText}
            </button>
          </div>
        </div>
      </div>

      {item.itemType === ItemType.coffee && (
        <section className="coffee-story-section">
          <div>
            <p className="coffee-detail-eyebrow">THE COFFEE</p>
            <h2>About this coffee.</h2>
            <p className="coffee-story-subtext">{item.itemDetails}</p>
          </div>
          <div className="coffee-story-copy">
            <ReactMarkdown>{item.itemSummary || item.itemDetails}</ReactMarkdown>
          </div>
        </section>
      )}

      {!hideDetailsDropdown && <div className="item-detail-dropdown">
        <button
          className="dropdown-toggle"
          onClick={toggleDetailsDropdown}
        >
          <h2>DETAILS</h2>
          <span className={`dropdown-arrow ${isDetailsDropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        <div className={`dropdown-content ${isDetailsDropdownOpen ? 'open' : ''}`}>
          {renderDetailsSection ? renderDetailsSection(item) : item.itemSummary ? <ReactMarkdown>{item.itemSummary}</ReactMarkdown> : <p>More details about this item will be displayed here.</p>}
        </div>
      </div>}
      {renderBrewingMethod && renderBrewingMethod(item)}

      {relatedItems.length > 0 && (
        <section className="you-may-also-like">
          <div className="related-heading">
            <h2>You might also like...</h2>
          </div>
          <div className="related-grid">
            {relatedItems.map((relatedItem) => (
              <button
                type="button"
                className="related-card"
                key={relatedItem.sku}
                onClick={() => navigate(`/shop/${generateSlug(relatedItem.name)}`)}
              >
                <span className="related-image-wrap">
                  <img
                    src={relatedItem.firebaseImageUrls?.[0] || ICONS.shopPlaceholder}
                    alt={relatedItem.name}
                  />
                </span>
                <span className="related-card-copy">
                  <strong>{relatedItem.name}</strong>
                  <small>{ItemType[relatedItem.itemType].replace(/([A-Z])/g, ' $1').toUpperCase()} · ${relatedItem.price.toFixed(2)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ItemView;
