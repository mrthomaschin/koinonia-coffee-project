import React from 'react';
import { Item } from './ItemModel';
import './ItemPreview.css';

interface ItemPreviewProps {
  item: Item;
  onClick: (item: Item) => void;
  renderExtraDetails?: (item: Item) => React.ReactNode;
  renderTags?: (item: Item) => React.ReactNode;
}

const ItemPreview: React.FC<ItemPreviewProps> = ({
  item,
  onClick,
  renderExtraDetails,
  renderTags
}) => {
  const imageUrl = item.firebaseImageUrls && item.firebaseImageUrls.length > 0
    ? item.firebaseImageUrls[0]
    : "/assets/images/shop_placeholder.png";

  return (
    <div className="item-preview" onClick={() => onClick(item)}>
      <div className="preview-image-container">
        <img
          src={imageUrl}
          alt={item.name}
          className="preview-image"
          loading="lazy"
        />
        <div className="preview-overlay">
          <span className="preview-view-details">VIEW DETAILS</span>
        </div>
      </div>

      <div className="preview-content">
        <div className="preview-header">
          <h3 className="preview-name">{item.name}</h3>
          <span className="preview-price">${item.price.toFixed(2)}</span>
        </div>

        {renderExtraDetails && (
          <div className="preview-details">
            {renderExtraDetails(item)}
          </div>
        )}

        <p className="preview-description">{item.summary}</p>

        {renderTags && (
          <div className="preview-tags">
            {renderTags(item)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemPreview;
