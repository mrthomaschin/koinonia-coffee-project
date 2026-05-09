declare global {
    interface Window {
        dataLayer: any[];
        gtag: (...args: any[]) => void;
    }
}

class TrackingService {
    private static instance: TrackingService;
    private readonly measurementId = 'G-NM1R5PHL4F';
    private initialized = false;

    private constructor() { }

    public static getInstance(): TrackingService {
        if (!TrackingService.instance) {
            TrackingService.instance = new TrackingService();
        }
        return TrackingService.instance;
    }

    public initialize(): void {
        if (this.initialized) {
            return;
        }

        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
            window.dataLayer.push(arguments);
        };

        window.gtag('js', new Date());
        window.gtag('config', this.measurementId, {
            send_page_view: false
        });

        this.initialized = true;
    }

    public trackPageView(path: string, title?: string): void {
        if (!this.initialized) {
            console.warn('TrackingService not initialized');
            return;
        }

        window.gtag('event', 'page_view', {
            page_path: path,
            page_title: title || document.title,
        });
    }

    public trackEvent(
        eventName: string,
        eventParams?: Record<string, any>
    ): void {
        if (!this.initialized) {
            console.warn('TrackingService not initialized');
            return;
        }

        window.gtag('event', eventName, eventParams);
    }

    public trackAddToCart(itemId: string, itemName: string, price: number, quantity: number): void {
        this.trackEvent('add_to_cart', {
            currency: 'USD',
            value: price * quantity,
            items: [{
                item_id: itemId,
                item_name: itemName,
                price: price,
                quantity: quantity,
            }]
        });
    }

    public trackRemoveFromCart(itemId: string, itemName: string, price: number, quantity: number): void {
        this.trackEvent('remove_from_cart', {
            currency: 'USD',
            value: price * quantity,
            items: [{
                item_id: itemId,
                item_name: itemName,
                price: price,
                quantity: quantity,
            }]
        });
    }

    public trackPurchase(transactionId: string, value: number, items: any[]): void {
        this.trackEvent('purchase', {
            transaction_id: transactionId,
            currency: 'USD',
            value: value,
            items: items,
        });
    }

    public trackFormSubmit(formName: string): void {
        this.trackEvent('form_submit', {
            form_name: formName,
        });
    }

    public trackButtonClick(buttonName: string, location?: string): void {
        this.trackEvent('button_click', {
            button_name: buttonName,
            location: location,
        });
    }
}

export default TrackingService.getInstance();