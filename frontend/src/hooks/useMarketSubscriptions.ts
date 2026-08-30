import { useState, useCallback } from 'react';

export const useMarketSubscriptions = () => {
    const [subscribedList, setSubscribedList] = useState<string[]>([]);
    const [selectedSymbol, setSelectedSymbol] = useState<string>('');

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
            
            setSubscribedList(prev => prev.filter(s => s !== upperSymbol));
            
            setSelectedSymbol(current => (current === upperSymbol ? '' : current));
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