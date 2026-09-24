import { useState, useEffect, useRef } from 'react';
import { Client, type StompSubscription } from '@stomp/stompjs';
import type { OHLCVCandle, ConnectionState } from '../types';

export type LiveCandle = OHLCVCandle & { symbol: string };

/**
 * Subscribes over STOMP to /topic/market/{symbol} and returns the latest
 * server-aggregated 1-minute candle for that symbol.
 *
 * One STOMP connection is kept per `url`; changing `symbol` only swaps the
 * subscription, it does not reconnect.
 *
 * @param url    STOMP-over-WebSocket endpoint (e.g. ws://localhost:8081/ws/market-data)
 * @param symbol Symbol to subscribe to, or null for no subscription
 */
export const useLiveMarketData = (url: string, symbol: string | null) => {
    const [candle, setCandle] = useState<LiveCandle | null>(null);
    const [status, setStatus] = useState<ConnectionState>('CONNECTING');

    const clientRef = useRef<Client | null>(null);
    const subRef = useRef<StompSubscription | null>(null);
    // Lets the connection callbacks see the current symbol without re-creating the client.
    const symbolRef = useRef<string | null>(symbol);

    const subscribeTo = (client: Client, sym: string | null) => {
        subRef.current?.unsubscribe();
        subRef.current = null;
        if (!sym) return;

        subRef.current = client.subscribe(`/topic/market/${sym}`, (message) => {
            try {
                const parsed = JSON.parse(message.body);
                // Stamp the symbol from the topic so SymbolLiveChart's symbol check
                // works even if the DTO payload doesn't carry it.
                setCandle({ ...parsed, symbol: sym });
            } catch (error) {
                console.error('[-] Failed to parse candle payload:', error);
            }
        });
    };

    // Connection lifecycle (one client per url)
    useEffect(() => {
        setStatus('CONNECTING');

        const client = new Client({
            brokerURL: url,
            reconnectDelay: 3000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            onConnect: () => {
                console.log(`[+] STOMP connected: ${url}`);
                setStatus('CONNECTED');
                subscribeTo(client, symbolRef.current);
            },
            onWebSocketClose: () => {
                subRef.current = null; // subscriptions die with the socket
                setStatus('DISCONNECTED');
            },
            onWebSocketError: () => setStatus('ERROR'),
            onStompError: (frame) => {
                console.error('[-] STOMP error:', frame.headers['message'], frame.body);
                setStatus('ERROR');
            },
        });

        clientRef.current = client;
        client.activate();

        return () => {
            subRef.current?.unsubscribe();
            subRef.current = null;
            clientRef.current = null;
            client.deactivate();
        };
    }, [url]);

    // Swap the subscription when the selected symbol changes
    useEffect(() => {
        symbolRef.current = symbol;
        setCandle(null); // don't carry the previous symbol's candle over

        const client = clientRef.current;
        if (client?.connected) {
            subscribeTo(client, symbol);
        }
        // If not connected yet, onConnect picks up symbolRef.current.
    }, [symbol]);

    return { candle, status };
};