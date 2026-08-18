import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  ColorType, 
  LineStyle, 
  AreaSeries, 
  LineSeries, 
  CandlestickSeries 
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { PricingData } from '../types';

type ChartViewType = 'candle' | 'area';

interface TradingViewChartProps {
  selectedSymbol: string;
  latestTick?: PricingData;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// CACHE COMPLETELY REMOVED
// We now generate history purely dynamically, strictly anchored to the CURRENT live price.
function generateHistory(symbol: string, basePrice: number, optionBase: number) {
  const points = 500;
  const now = Math.floor(Date.now() / 1000);
  const areaData = [];
  const candleData = [];
  const optionData = [];

  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i);

  // Start perfectly anchored to the exact incoming live price
  let currentClose = basePrice;
  const optionRatio = optionBase / basePrice; 

  // Loop backwards in time
  for (let i = 1; i <= points; i++) {
    const time = (now - i) as UTCTimestamp;
    const r1 = seededRandom(seed++);
    const r2 = seededRandom(seed++);
    const r3 = seededRandom(seed++);

    const volatility = basePrice * 0.001;
    
    // The close is our anchor going backwards
    const close = currentClose;
    
    // Calculate what the open must have been to get to this close
    const open = Number((close - (r1 - 0.5) * volatility).toFixed(2));
    const high = Number((Math.max(open, close) + r2 * volatility * 0.5).toFixed(2));
    const low = Number((Math.min(open, close) - r3 * volatility * 0.5).toFixed(2));

    const currentOption = Number((close * optionRatio).toFixed(3));

    areaData.push({ time, value: close });
    candleData.push({ time, open, high, low, close });
    optionData.push({ time, value: currentOption });

    // The open of this candle becomes the close of the previous (older) candle in the loop
    currentClose = open;
  }

  // Reverse the arrays so TradingView receives them in chronological order (Oldest -> Newest)
  areaData.reverse();
  candleData.reverse();
  optionData.reverse();

  return { areaData, candleData, optionData };
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  selectedSymbol,
  latestTick,
}) => {
  const [chartView, setChartView] = useState<ChartViewType>('candle');
  
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const optionSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  const currentCandleRef = useRef<{ time: UTCTimestamp; open: number; high: number; low: number; close: number } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    currentCandleRef.current = null;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#141414' }, textColor: '#a3a3a3' },
      grid: { vertLines: { color: '#1f1f1f' }, horzLines: { color: '#1f1f1f' } },
      crosshair: { vertLine: { color: '#525252', width: 1, style: LineStyle.Dashed }, horzLine: { color: '#525252', width: 1, style: LineStyle.Dashed } },
      
      // SINGLE price scale so everything pans together
      rightPriceScale: { visible: true, borderColor: '#262626', autoScale: true },
      leftPriceScale: { visible: false }, 
      
      timeScale: { borderColor: '#262626', timeVisible: true, secondsVisible: true },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      visible: chartView === 'candle',
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(56, 189, 248, 0.35)', bottomColor: 'rgba(56, 189, 248, 0.0)',
      lineColor: '#38bdf8', lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      visible: chartView === 'area',
    });

    const optionSeries = chart.addSeries(LineSeries, {
      color: '#c084fc', lineWidth: 2, lineStyle: LineStyle.Solid,
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });

    // Seed 500 points of dynamically generated history
    if (latestTick) {
      const history = generateHistory(selectedSymbol, latestTick.underlying_price, latestTick.option_price);
      candleSeries.setData(history.candleData);
      areaSeries.setData(history.areaData);
      optionSeries.setData(history.optionData);

      const last = history.candleData[history.candleData.length - 1];
      if (last) currentCandleRef.current = { ...last };
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    optionSeriesRef.current = optionSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  // Handle Chart View Toggling
  useEffect(() => {
    if (candleSeriesRef.current) candleSeriesRef.current.applyOptions({ visible: chartView === 'candle' });
    if (areaSeriesRef.current) areaSeriesRef.current.applyOptions({ visible: chartView === 'area' });
  }, [chartView]);

  // Handle High-Frequency Live Ticks
  useEffect(() => {
    if (!latestTick) return;

    const nowInSeconds = Math.floor((latestTick.timestamp || Date.now()) / 1000) as UTCTimestamp;
    const price = latestTick.underlying_price;

    // 1. Candlestick OHLC
    if (candleSeriesRef.current) {
      if (!currentCandleRef.current || currentCandleRef.current.time !== nowInSeconds) {
        currentCandleRef.current = { time: nowInSeconds, open: price, high: price, low: price, close: price };
      } else {
        currentCandleRef.current.high = Math.max(currentCandleRef.current.high, price);
        currentCandleRef.current.low = Math.min(currentCandleRef.current.low, price);
        currentCandleRef.current.close = price;
      }
      candleSeriesRef.current.update(currentCandleRef.current);
    }

    // 2. Area Series
    if (areaSeriesRef.current) {
      areaSeriesRef.current.update({ time: nowInSeconds, value: price });
    }

    // 3. Option Series
    if (optionSeriesRef.current) {
      optionSeriesRef.current.update({ time: nowInSeconds, value: latestTick.option_price });
    }
  }, [latestTick]);

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <div className="chart-title">
          <span className="symbol-label">{selectedSymbol}</span>
          <div className="chart-toggle-group">
            <button className={`toggle-btn ${chartView === 'candle' ? 'active' : ''}`} onClick={() => setChartView('candle')}>Candles</button>
            <button className={`toggle-btn ${chartView === 'area' ? 'active' : ''}`} onClick={() => setChartView('area')}>Area</button>
          </div>
        </div>
        <div className="chart-legend">
          <span className="legend-item option">
            <span className="legend-marker purple" /> Option Price
          </span>
          <span className="legend-item underlying">
            <span className="legend-marker cyan" /> Underlying Stock
          </span>
        </div>
      </div>
      <div ref={chartContainerRef} className="tv-canvas-container" />
    </div>
  );
};