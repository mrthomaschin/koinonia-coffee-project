import React from 'react';
import { MerchItem, MerchCategory } from './MerchItem';
import ItemPreview from '../ItemPreview';
import './MerchPreview.css';

interface MerchPreviewProps {
  item: MerchItem;
  onClick: (item: MerchItem) => void;
}

const MerchPreview: React.FC<MerchPreviewProps> = ({ item, onClick }) => {
  const renderExtraDetails = (merchItem: MerchItem) => (
    <>
      <span className="preview-category">{MerchCategory[merchItem.category]}</span>
      {merchItem.availableSizes.length > 0 && (
        <>
          <span className="preview-separator">•</span>
          <span className="preview-sizes">{merchItem.availableSizes.length} sizes</span>
        </>
      )}
      {merchItem.colors.length > 0 && (
        <>
          <span className="preview-separator">•</span>
          <span className="preview-colors">{merchItem.colors.length} colors</span>
        </>
      )}
    </>
  );

  return (
    <ItemPreview
      item={item}
      onClick={(baseItem) => onClick(baseItem as MerchItem)}
      renderExtraDetails={() => renderExtraDetails(item)}
    />
  );
};

export default MerchPreview;
