import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemBySlug } from '../shopData';
import { Item, ItemType } from './Item';
import { CoffeeBagItem } from './coffee_bag/CoffeeBagItem';
import { MerchItem } from './merch/MerchItem';
import CoffeeBagDetail from './coffee_bag/CoffeeBagDetail';
import MerchDetail from './merch/MerchDetail';
import './ItemDetail.css';

interface ItemDetailProps {
  availableHeight: number;
}

export const ItemDetail: React.FC<ItemDetailProps> = ({ availableHeight }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const item = slug ? getItemBySlug(slug) : undefined;

  const handleBack = () => {
    navigate('/shop');
  };

  if (!item) {
    return (
      <div className="shop-page" style={{ minHeight: availableHeight }}>
        <div className="shop-header">
          <h1 className="shop-title">Item Not Found</h1>
          <button onClick={handleBack} className="back-button">
            Back to Shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-item-page" style={{ minHeight: availableHeight }}>
      {item.itemType === ItemType.beans && (
        <CoffeeBagDetail item={item as CoffeeBagItem} onBack={handleBack} />
      )}
      {item.itemType === ItemType.merch && (
        <MerchDetail item={item as MerchItem} onBack={handleBack} />
      )}
    </div>
  );
};

export default ItemDetail;
