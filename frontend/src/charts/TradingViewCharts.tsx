import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { OHLCVCandle } from '../types';

interface TradingViewChartProps {
    data: OHLCVCandle[];
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({ data }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#131722' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#2b2b43' },
                horzLines: { color: '#2b2b43' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!seriesRef.current || !data || data.length === 0) return;

        try {
            const now = Date.now();
            // הגבלה ל-24 השעות האחרונות בלבד (משליך לפח את כל ההיסטוריה של השנה האחרונה)
            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

            const mappedData = data
                .filter(candle => {
                    if (!candle || typeof candle.time !== 'number' || isNaN(candle.time)) return false;
                    // סינון ששומר רק נרות מהיממה האחרונה
                    return (now - candle.time) <= TWENTY_FOUR_HOURS_MS;
                })
                .map(candle => ({
                    time: (Math.floor(candle.time / 1000)) as Time,
                    open: Number(candle.open),
                    high: Number(candle.high),
                    low: Number(candle.low),
                    close: Number(candle.close),
                }));

            // מיון עולה ומניעת כפילויות זמן
            const uniqueSortedData = mappedData
                .sort((a, b) => (a.time as number) - (b.time as number))
                .filter((item, index, arr) => index === 0 || item.time !== arr[index - 1].time);

            if (uniqueSortedData.length > 0) {
                seriesRef.current.setData(uniqueSortedData);
            }
        } catch (e) {
            console.error("Failed to set live chart data:", e);
        }
    }, [data]);

    return (
        <div 
            ref={chartContainerRef} 
            style={{ width: '100%', height: '400px', minHeight: '400px', display: 'block' }} 
        />
    );
};

export default TradingViewChart;