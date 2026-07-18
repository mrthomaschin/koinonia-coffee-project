import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
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

interface ItemViewProps {
  availableHeight?: number;
  item?: Item;
  onBack?: () => void;
  renderMetadata?: (item: Item) => React.ReactNode;
  renderExtraInfo?: (item: Item) => React.ReactNode;
  renderOptions?: (item: Item) => React.ReactNode;
  renderDetailsSection?: (item: Item) => React.ReactNode;
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
  renderBrewingMethod,
  calculatePrice,
  handleAddToCart,
  isSoldOut,
}) => {
  const { cart } = useCart();
  const {
    item: viewModelItem,
    handleBack: viewModelHandleBack,
    isDetailsDropdownOpen,
    isBrewingMethodDropdownOpen,
    toggleDetailsDropdown,
    toggleBrewingMethodDropdown,
    defaultCalculatePrice,
    defaultHandleAddToCart,
  } = useItemDetailViewModel(itemProp, cart);

  const item = itemProp || viewModelItem;
  const onBack = onBackProp || viewModelHandleBack;

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

  if (!itemProp && availableHeight !== undefined) {
    return (
      <div className="shop-item-page" style={{ minHeight: availableHeight }}>
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
                  alt={`${item.name} - Image ${index + 1}`}
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

          {renderExtraInfo && renderExtraInfo(item)}

          {renderOptions && (
            <div className="detail-options">
              {renderOptions(item)}
            </div>
          )}

          <div className="detail-purchase">
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
      <div className="item-detail-dropdown">
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
      </div>
      {renderBrewingMethod && <div className="item-detail-dropdown">
        <button
          className="dropdown-toggle"
          onClick={toggleBrewingMethodDropdown}
        >
          <h2>BREWING METHOD</h2>
          <span className={`dropdown-arrow ${isBrewingMethodDropdownOpen ? 'open' : ''}`}>▼</span>
        </button>
        <div className={`dropdown-content ${isBrewingMethodDropdownOpen ? 'open' : ''}`}>
          {renderBrewingMethod(item)}
        </div>
      </div>}
    </div>
  );
};

export default ItemView;
