import React from 'react';
import { Item } from './Item';
import './ItemDetail.css';

interface ItemDetailProps {
  item: Item;
  onClose: () => void;
  renderMetadata?: (item: Item) => React.ReactNode;
  renderExtraInfo?: (item: Item) => React.ReactNode;
  renderOptions?: (item: Item) => React.ReactNode;
  renderPurchaseSection?: (item: Item) => React.ReactNode;
}

const ItemDetail: React.FC<ItemDetailProps> = ({ 
  item, 
  onClose,
  renderMetadata,
  renderExtraInfo,
  renderOptions,
  renderPurchaseSection
}) => {
  return (
    <div className="item-detail-overlay" onClick={onClose}>
      <div className="item-detail" onClick={(e) => e.stopPropagation()}>
        <button className="detail-close-button" onClick={onClose}>
          ✕
        </button>

        <div className="detail-container">
          <div className="detail-image-section">
            <img 
              src={item.image} 
              alt={item.name}
              className="detail-image"
            />
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

            <p className="detail-description">{item.description}</p>

            {renderExtraInfo && renderExtraInfo(item)}

            {renderOptions && (
              <div className="detail-options">
                {renderOptions(item)}
              </div>
            )}

            {renderPurchaseSection ? (
              renderPurchaseSection(item)
            ) : (
              <div className="detail-purchase">
                <div className="detail-price-section">
                  <span className="detail-price-label">Price</span>
                  <span className="detail-price">${item.price.toFixed(2)}</span>
                </div>
                <button className="detail-add-to-cart">
                  Add to Cart
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetail;
