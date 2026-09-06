import { useState, useEffect, useRef, useCallback } from 'react';
import type { MonteCarloResultDTO } from '../types';

// הגדרת מצבי החיבור כדי שנוכל להציג אותם ב-UI
export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export const useMonteCarloData = (url: string) => {
    const [data, setData] = useState<MonteCarloResultDTO | null>(null);
    const [status, setStatus] = useState<ConnectionState>('CONNECTING');
    const wsRef = useRef<WebSocket | null>(null);
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
                const parsedData: MonteCarloResultDTO = JSON.parse(event.data);
                setData(parsedData);
            } catch (error) {
                console.error("[-] Failed to parse Monte Carlo data payload:", error);
            }
        };

        ws.onclose = () => {
            console.warn("[-] Monte Carlo Stream disconnected. Attempting to reconnect in 3s...");
            setStatus('DISCONNECTED');
            
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
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close();
            }
        };
    }, [connect]);

    // הפונקציה החדשה שמאפשרת לנו לשלוח פקודת חישוב לשרת דרך ה-WebSocket
    const requestSimulation = useCallback((symbol: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            setData(null); // מנקים את הדאטה הישן כדי להראות מצב טעינה
            wsRef.current.send(JSON.stringify({ action: 'run_simulation', symbol }));
            console.log(`[*] Simulation request sent for ${symbol}`);
        } else {
            console.error("[-] Cannot send request: WebSocket is not connected.");
        }
    }, []);

    return { data, status, requestSimulation };
};