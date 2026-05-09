import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getItemBySlug } from '../shopData';
import { Item } from './ItemModel';
import { CartViewModel } from '../../cart/CartViewModel';

export const useItemDetailViewModel = (itemProp?: Item, cart?: CartViewModel) => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const routedItem = slug ? getItemBySlug(slug) : undefined;
    const item = itemProp || routedItem;

    const [isDetailsDropdownOpen, setIsDetailsDropdownOpen] = useState(false);
    const [isBrewingMethodDropdownOpen, setIsBrewingMethodDropdownOpen] = useState(false);

    const handleBack = () => {
        navigate('/shop');
    };

    const toggleDetailsDropdown = () => {
        setIsDetailsDropdownOpen(!isDetailsDropdownOpen);
    };

    const toggleBrewingMethodDropdown = () => {
        setIsBrewingMethodDropdownOpen(!isBrewingMethodDropdownOpen);
    };

    const defaultCalculatePrice = (): string => {
        return item ? item.price.toFixed(2) : '0.00';
    };

    const defaultHandleAddToCart = (): void => {
        if (item && cart) {
            const result = cart.addItem(item);
            console.log('Add to cart result:', result);
        }
    };

    return {
        item,
        handleBack,
        isDetailsDropdownOpen,
        isBrewingMethodDropdownOpen,
        toggleDetailsDropdown,
        toggleBrewingMethodDropdown,
        defaultCalculatePrice,
        defaultHandleAddToCart,
    };
};
