import React from 'react';
import { CoffeeBagItem, RoastLevel } from './CoffeeBagItem';
import ItemPreview from '../ItemPreview';
import './CoffeeBagPreview.css';

interface CoffeeBagPreviewProps {
  item: CoffeeBagItem;
  onClick: (item: CoffeeBagItem) => void;
}

const CoffeeBagPreview: React.FC<CoffeeBagPreviewProps> = ({ item, onClick }) => {
  const renderExtraDetails = (coffeeItem: CoffeeBagItem) => (
    <>
      <span className="preview-roast">{RoastLevel[coffeeItem.roastLevel]} roast</span>
      <span className="preview-separator">•</span>
      <span className="preview-weight">{coffeeItem.weight}oz</span>
    </>
  );

  return (
    <ItemPreview
      item={item}
      onClick={(baseItem) => onClick(baseItem as CoffeeBagItem)}
      renderExtraDetails={() => renderExtraDetails(item)}
    />
  );
};

export default CoffeeBagPreview;
