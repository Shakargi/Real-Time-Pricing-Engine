import { useState, useCallback, useEffect } from 'react';

export const useMarketSubscriptions = () => {
    // 1. Initialize state from localStorage (if exists)
    const [subscribedList, setSubscribedList] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('active_subscriptions');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("[-] Error parsing subscriptions from localStorage", error);
            return [];
        }
    });

    // 2. Initialize selected tab from localStorage to persist UI state
    const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
        try {
            const saved = localStorage.getItem('active_subscriptions');
            const parsedList = saved ? JSON.parse(saved) : [];
            // Default to the first symbol in the list if it exists
            return parsedList.length > 0 ? parsedList[0] : '';
        } catch (error) {
            return '';
        }
    });

    // 3. Auto-save to localStorage whenever the list changes
    useEffect(() => {
        localStorage.setItem('active_subscriptions', JSON.stringify(subscribedList));
    }, [subscribedList]);

    const subscribe = useCallback(async (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        try {
            await fetch(`http://localhost:8081/api/symbols/${upperSymbol}`, {
                method: 'POST',
            });
            
            setSubscribedList(prev => {
                if (!prev.includes(upperSymbol)) {
                    return [...prev, upperSymbol];
                }
                return prev;
            });
            
            setSelectedSymbol(upperSymbol);
            console.log(`[+] Successfully requested stream for ${upperSymbol}`);
        } catch (error) {
            console.error(`[-] Failed to subscribe to ${upperSymbol}:`, error);
        }
    }, []);

    const unsubscribe = useCallback(async (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        try {
            await fetch(`http://localhost:8081/api/symbols/${upperSymbol}`, {
                method: 'DELETE',
            });
            
            setSubscribedList(prev => {
                const newList = prev.filter(s => s !== upperSymbol);
                // If we closed the active tab, switch selection to the first available tab, or clear it
                setSelectedSymbol(current => {
                    if (current === upperSymbol) {
                        return newList.length > 0 ? newList[0] : '';
                    }
                    return current;
                });
                return newList;
            });
            
            console.log(`[-] Successfully stopped stream for ${upperSymbol}`);
        } catch (error) {
            console.error(`[-] Failed to unsubscribe from ${upperSymbol}:`, error);
        }
    }, []);

    return {
        subscribedList,
        selectedSymbol,
        setSelectedSymbol,
        subscribe,
        unsubscribe
    };
};