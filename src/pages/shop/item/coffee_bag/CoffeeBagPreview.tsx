import React from 'react';
import { CoffeeBagItem, RoastLevel } from './CoffeeBagItem';
import ItemPreview from '../ItemPreview';
import './CoffeeBagPreview.css';
import { ItemType } from '../ItemModel';

interface CoffeeBagPreviewProps {
  item: CoffeeBagItem;
  onClick: (item: CoffeeBagItem) => void;
}

const CoffeeBagPreview: React.FC<CoffeeBagPreviewProps> = ({ item, onClick }) => {
  const renderExtraDetails = (coffeeItem: CoffeeBagItem) => (
    <>
      <span className="preview-category">{ItemType[coffeeItem.itemType]}</span>
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
