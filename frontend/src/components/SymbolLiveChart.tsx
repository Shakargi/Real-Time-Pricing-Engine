import React, { useState, useEffect, useRef, useMemo } from 'react';
import TradingViewChart from '../charts/TradingViewCharts';
import MetricCard from './MetricCard';
import { INTERVAL_MS, type Timeframe } from '../constants/timeframes';
import type { OHLCVCandle } from '../types';
import type { LiveCandle } from '../hooks/useLiveMarketData';

const MINUTE_MS = 60_000;
const DAY_SEC = 86_400;
const MAX_LIVE_MINUTES = 2_880; // ~48h of 1-minute candles kept in memory

/** The server may send epoch seconds or milliseconds; normalise to ms. */
const toEpochMs = (t: unknown): number => {
    const ms = Number(t);
    return ms < 1e11 ? ms * 1000 : ms;
};

interface AssetProfile {
    name?: string;
    sector?: string;
    description?: string;
    marketCap?: string;
    trailingPE?: string;
    beta?: string;
    dividendYield?: string;
}

interface SymbolLiveChartProps {
    symbol: string;
    /** Latest live 1-minute candle for this symbol, delivered over the STOMP /topic/market/{symbol} subscription (see useLiveMarketData). Already fully aggregated server-side by AlpacaLiveStreamService/BinanceLiveStreamService. */
    globalCandle: (OHLCVCandle & { symbol: string }) | null;
    timeframe: Timeframe;
}

/**
 * Renders one symbol's chart, header price, and fundamentals panel.
 *
 * `globalCandle` arrives pre-aggregated: AlpacaLiveStreamService (or
 * BinanceLiveStreamService for USDT pairs) builds a complete 1-minute
 * OHLCVCandleDTO server-side and broadcasts it over STOMP to
 * /topic/market/{symbol}. useLiveMarketData now speaks real STOMP (see that
 * file for why the previous raw-WebSocket client never actually received
 * anything from this specific endpoint), so this is consumed as-is rather
 * than re-aggregated from raw ticks.
 */
const SymbolLiveChart: React.FC<SymbolLiveChartProps> = ({ symbol, globalCandle, timeframe }) => {
    const [historicalCandles, setHistoricalCandles] = useState<OHLCVCandle[]>([]);
    const [profile, setProfile] = useState<AssetProfile | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const intervalMs = INTERVAL_MS[timeframe];

    // Every 1-minute candle received live for this symbol, keyed by minute start (ms).
    // The server re-sends the SAME minute repeatedly with cumulative OHLCV, so keying by
    // minute means the newest message for a minute replaces the previous one, while
    // completed minutes are retained (previously they vanished when the minute rolled over).
    const [liveMinutes, setLiveMinutes] = useState<Record<number, LiveCandle>>({});
    // When the REST snapshot was taken; used to avoid double-counting volume that is
    // already inside the snapshot's most recent bar.
    const snapshotAtMs = useRef<number>(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                // Clear the previous symbol/timeframe's candles immediately so the header
                // price can't keep showing a stale value while the canvas says "loading".
                setHistoricalCandles([]);

                const [chartRes, profileRes] = await Promise.all([
                    fetch(`http://localhost:8081/api/symbols/${symbol}/chart?interval=${timeframe}`),
                    fetch(`http://localhost:8081/api/symbols/${symbol}/profile`).catch(() => null)
                ]);

                if (!chartRes.ok) {
                    setError(`No market data available for '${symbol}'.`);
                    return;
                }

                const chartData = await chartRes.json();
                const profileData = profileRes && profileRes.ok ? await profileRes.json() : null;
                snapshotAtMs.current = Date.now();

                if (chartData && chartData.length > 0) {
                    const formattedHistory = chartData.map((c: any) => ({
                        ...c,
                        time: Math.floor(c.time / 1000)
                    }));
                    setHistoricalCandles(formattedHistory);
                    setProfile(profileData);
                } else {
                    setError(`Ticker '${symbol}' has no historical data.`);
                }
            } catch (err) {
                setError(`Network error fetching data for '${symbol}'.`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [symbol, timeframe]);

    const liveCandle = globalCandle && globalCandle.symbol === symbol ? globalCandle : null;

    // Tracks whether ANY live candle has ever arrived for this symbol —
    // distinguishes "quiet right now" from "nothing is actively streaming this
    // symbol at all" (e.g. it was never subscribed server-side, or the STOMP
    // subscription hasn't landed yet).
    const hasReceivedLiveTick = useRef(false);
    useEffect(() => {
        if (liveCandle) hasReceivedLiveTick.current = true;
    }, [liveCandle]);

    // Accumulate live 1-minute candles (bounded) instead of keeping only the latest one.
    useEffect(() => {
        if (!liveCandle || isNaN(liveCandle.close)) return;
        const minuteMs = Math.floor(toEpochMs(liveCandle.time) / MINUTE_MS) * MINUTE_MS;
        setLiveMinutes(prev => {
            const next = { ...prev, [minuteMs]: liveCandle };
            const keys = Object.keys(next).map(Number);
            if (keys.length > MAX_LIVE_MINUTES) {
                keys.sort((a, b) => a - b)
                    .slice(0, keys.length - MAX_LIVE_MINUTES)
                    .forEach(k => delete next[k]);
            }
            return next;
        });
    }, [liveCandle]);

    // Historical REST bars + live 1-minute candles re-aggregated into the selected
    // timeframe. Because ALL live minutes are folded in (in time order), a forming
    // 5m/15m/1h/1d bar keeps the highs, lows and volume of its earlier minutes and
    // extends correctly as new minutes arrive.
    const chartData = useMemo(() => {
        const dataMap = new Map<number, any>();

        historicalCandles.forEach(c => {
            if (!c || isNaN(c.close) || c.close <= 0) return;
            const isFloating = c.open === c.close && c.high === c.low;
            if (c.volume <= 0 || isFloating) return;
            dataMap.set(c.time as number, c);
        });

        // The snapshot already contains trades up to ~snapshotAtMs. Minutes before that
        // are already reflected in it; the minute containing it overlaps partially
        // (use its price, skip its volume); later minutes are entirely new.
        const cutoffMinute = Math.floor(snapshotAtMs.current / MINUTE_MS) * MINUTE_MS;
        const liveOnlyBuckets = new Set<number>(); // buckets built purely from live data

        Object.keys(liveMinutes)
            .map(Number)
            .sort((a, b) => a - b)
            .forEach(minuteMs => {
                const c = liveMinutes[minuteMs];
                const bucketSec = Math.floor((Math.floor(minuteMs / intervalMs) * intervalMs) / 1000);
                const existing = dataMap.get(bucketSec);

                if (!existing) {
                    dataMap.set(bucketSec, {
                        time: bucketSec as any,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume || 0
                    });
                    liveOnlyBuckets.add(bucketSec);
                    return;
                }

                const liveOnly = liveOnlyBuckets.has(bucketSec);
                dataMap.set(bucketSec, {
                    ...existing,
                    high: Math.max(existing.high, c.high),
                    low: Math.min(existing.low, c.low),
                    close: liveOnly || minuteMs >= cutoffMinute ? c.close : existing.close,
                    volume: existing.volume + (liveOnly || minuteMs > cutoffMinute ? (c.volume || 0) : 0)
                });
            });

        return Array.from(dataMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    }, [historicalCandles, liveMinutes, intervalMs]);

    const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;

    // Per-tick flash: did the price move up or down since the immediately
    // preceding candle? This drives the theme's own GPU-accelerated
    // .flash-up/.flash-down background pulse (fintech-theme.css) — a
    // transient "it just moved" signal, separate from the stable period
    // trend below.
    const previousPrice = chartData.length > 1 ? chartData[chartData.length - 2].close : null;
    const isTickUp = currentPrice != null && previousPrice != null ? currentPrice >= previousPrice : null;
    const tickFlashClass = isTickUp === null ? '' : isTickUp ? 'flash-up' : 'flash-down';

    // Change vs. the close 24h before the latest bar. The previous reference
    // (chartData[0].open) was the start of the whole REST window — potentially days
    // before what's on screen — so the header could say "down" while the visible
    // candles climbed. A rolling 24h reference is stable across timeframe tabs
    // (on 1d it is the previous close) and is what exchanges display. If the loaded
    // data spans less than 24h, fall back to the first bar's open.
    const referencePrice = useMemo(() => {
        if (chartData.length === 0) return null;
        const cutoffSec = (chartData[chartData.length - 1].time as number) - DAY_SEC;
        for (let i = chartData.length - 1; i >= 0; i--) {
            if ((chartData[i].time as number) <= cutoffSec) return chartData[i].close as number;
        }
        return chartData[0].open as number;
    }, [chartData]);

    const changeAbs = currentPrice != null && referencePrice != null ? currentPrice - referencePrice : null;
    const changePct = changeAbs != null && referencePrice ? (changeAbs / referencePrice) * 100 : null;
    const isPeriodUp = changeAbs != null ? changeAbs >= 0 : null;

    const periodHigh = chartData.length > 0 ? Math.max(...chartData.map(c => c.high)) : 0;
    const periodLow = chartData.length > 0 ? Math.min(...chartData.map(c => c.low)) : 0;
    const totalVolume = chartData.length > 0 ? chartData.reduce((sum, c) => sum + (c.volume || 0), 0) : 0;

    return (
        <div key={`${symbol}-${timeframe}`} className="chart-panel reveal" style={{ height: '100%' }}>
            <div className="chart-header">
                <div className="chart-title">
                    <h3 className="symbol-label">
                        {symbol} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal', fontFamily: 'var(--font-sans)' }}>{profile?.name ? `| ${profile.name}` : ''}</span>
                    </h3>
                    {!isLoading && currentPrice && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                            <span key={currentPrice} className={`mono-data value-pop tabular-nums ${tickFlashClass}`} style={{ fontSize: '1.4rem', fontWeight: 'bold', color: isPeriodUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)', borderRadius: '4px', padding: '0 4px' }}>
                                ${currentPrice.toFixed(2)}
                            </span>
                            {changeAbs != null && changePct != null && (
                                <span
                                    className="mono-data tabular-nums"
                                    style={{ fontSize: '0.85rem', color: isPeriodUp ? 'var(--trade-up-text)' : 'var(--trade-down-text)' }}
                                    title={`24h change (vs. $${referencePrice!.toFixed(2)})`}
                                >
                                    {isPeriodUp ? '▲' : '▼'} {Math.abs(changeAbs).toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="tv-canvas-container">
                {isLoading ? (
                    <div className="empty-state terminal-panel" style={{ height: '100%' }}>
                        <div className="skeleton-box" style={{ width: '280px', height: '4px', marginBottom: 'var(--space-md)' }} />
                        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Loading {symbol} · {timeframe.toUpperCase()} candles…</span>
                    </div>
                ) : error ? (
                    <div className="empty-state" style={{ color: 'var(--status-offline)' }}>⚠️ {error}</div>
                ) : (
                    <TradingViewChart data={chartData} />
                )}
            </div>

            {!isLoading && !error && chartData.length > 0 && profile && (
                <div className="reveal" style={{ borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <div className="metric-card-container">
                        <MetricCard label="Period High" value={periodHigh} isCurrency animateOnChange={false} />
                        <MetricCard label="Period Low" value={periodLow} isCurrency animateOnChange={false} />
                        <MetricCard label="Total Volume" value={totalVolume.toLocaleString()} animateOnChange={false} />
                        <MetricCard label="Market Cap" value={profile.marketCap} animateOnChange={false} />
                        <MetricCard label="P/E Ratio" value={profile.trailingPE} animateOnChange={false} />
                        <MetricCard label="Beta" value={profile.beta} animateOnChange={false} />
                        <MetricCard label="Div Yield" value={profile.dividendYield} animateOnChange={false} />
                    </div>
                    <div style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.5', backgroundColor: 'var(--bg-panel)' }}>
                        <p style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{profile.description || 'No description available.'}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SymbolLiveChart;