import React from 'react';
import { Item } from './Item';
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
  return (
    <div className="item-preview" onClick={() => onClick(item)}>
      <div className="preview-image-container">
        <img
          src={item.image}
          alt={item.name}
          className="preview-image"
        />
        <div className="preview-overlay">
          <span className="preview-view-details">View Details</span>
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

        <p className="preview-description">{item.description}</p>

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
