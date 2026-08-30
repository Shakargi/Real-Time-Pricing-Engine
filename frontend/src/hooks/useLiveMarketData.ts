import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarketTick, ConnectionState } from '../types';

/**
 * Custom hook to manage the WebSocket connection for real-time market ticks.
 * 
 * @param url The WebSocket endpoint URL (e.g., ws://localhost:8000/ws/live)
 */
export const useLiveMarketData = (url: string) => {
    const [tick, setTick] = useState<MarketTick | null>(null);
    const [status, setStatus] = useState<ConnectionState>('CONNECTING');
    const wsRef = useRef<WebSocket | null>(null);
    // FIXED: Using ReturnType to automatically infer the correct timeout type for the browser environment
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
        setStatus('CONNECTING');
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[+] Connected to Live Market Stream: ${url}`);
            setStatus('CONNECTED');
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const parsedTick: MarketTick = JSON.parse(event.data);
                setTick(parsedTick);
            } catch (error) {
                console.error("[-] Failed to parse Market Tick payload:", error);
            }
        };

        ws.onclose = () => {
            console.warn("[-] Live Market Stream disconnected. Attempting to reconnect in 3s...");
            setStatus('DISCONNECTED');
            
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = () => {
            setStatus('ERROR');
            ws.close();
        };
    }, [url]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { tick, status };
};