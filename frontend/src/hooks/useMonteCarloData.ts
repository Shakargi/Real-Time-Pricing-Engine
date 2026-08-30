import { useState, useEffect, useRef, useCallback } from 'react';
import type { MonteCarloResult, ConnectionState } from '../types';

/**
 * Custom hook to manage the WebSocket connection for Monte Carlo simulation results.
 * Implements automatic reconnection with a fixed delay.
 * 
 * @param url The WebSocket endpoint URL (e.g., ws://localhost:8000/ws/pricing)
 */
export const useMonteCarloData = (url: string) => {
    const [data, setData] = useState<MonteCarloResult | null>(null);
    const [status, setStatus] = useState<ConnectionState>('CONNECTING');
    const wsRef = useRef<WebSocket | null>(null);
    // FIXED: Using ReturnType to automatically infer the correct timeout type for the browser environment
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
        setStatus('CONNECTING');
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log(`[+] Connected to Monte Carlo Stream: ${url}`);
            setStatus('CONNECTED');
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const parsedData: MonteCarloResult = JSON.parse(event.data);
                // Append local timestamp for charting purposes if not provided
                parsedData.timestamp = parsedData.timestamp || Date.now();
                setData(parsedData);
            } catch (error) {
                console.error("[-] Failed to parse Monte Carlo data payload:", error);
            }
        };

        ws.onclose = () => {
            console.warn("[-] Monte Carlo Stream disconnected. Attempting to reconnect in 3s...");
            setStatus('DISCONNECTED');
            
            // Attempt to reconnect after 3 seconds
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000);
        };

        ws.onerror = (error: Event) => {
            console.error("[-] Monte Carlo WebSocket Error:", error);
            setStatus('ERROR');
            ws.close(); 
        };
    }, [url]);

    useEffect(() => {
        connect();

        // Cleanup function on unmount
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }
        };
    }, [connect]);

    return { data, status };
};