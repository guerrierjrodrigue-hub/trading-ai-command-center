"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { ema, rsi } from "@/services/market/indicators";
import type { Candle } from "@/services/market/types";

interface Props {
  candles: Candle[];
  showEma?: boolean;
  showVolume?: boolean;
  height?: number;
}

const COMMON = {
  layout: {
    background: { type: ColorType.Solid, color: "#141722" },
    textColor: "#8b93a7",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  grid: {
    vertLines: { color: "#1b2030" },
    horzLines: { color: "#1b2030" },
  },
  rightPriceScale: { borderColor: "#232838" },
  timeScale: { borderColor: "#232838", timeVisible: true, secondsVisible: false },
  crosshair: { mode: 0 as const },
};

export function CandleChart({
  candles,
  showEma = true,
  showVolume = true,
  height = 380,
}: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainRef.current || candles.length === 0) return;

    const chart: IChartApi = createChart(mainRef.current, {
      ...COMMON,
      width: mainRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#f43f5e",
      borderUpColor: "#22c55e",
      borderDownColor: "#f43f5e",
      wickUpColor: "#22c55e",
      wickDownColor: "#f43f5e",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (showEma) {
      const closes = candles.map((c) => c.close);
      const e20 = ema(closes, 20);
      const e50 = ema(closes, 50);
      const l20 = chart.addLineSeries({ color: "#7c5cff", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      const l50 = chart.addLineSeries({ color: "#22d3ee", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      l20.setData(
        candles
          .map((c, i) => ({ time: c.time as UTCTimestamp, value: e20[i] }))
          .filter((p) => !Number.isNaN(p.value)),
      );
      l50.setData(
        candles
          .map((c, i) => ({ time: c.time as UTCTimestamp, value: e50[i] }))
          .filter((p) => !Number.isNaN(p.value)),
      );
    }

    if (showVolume) {
      const volSeries = chart.addHistogramSeries({
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        color: "#2a3040",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(244,63,94,0.35)",
        })),
      );
    }

    chart.timeScale().fitContent();

    // RSI sub-chart
    let rsiChart: IChartApi | null = null;
    if (rsiRef.current) {
      rsiChart = createChart(rsiRef.current, {
        ...COMMON,
        width: rsiRef.current.clientWidth,
        height: 120,
      });
      const closes = candles.map((c) => c.close);
      const rsiVals = rsi(closes, 14);
      const rsiSeries = rsiChart.addLineSeries({ color: "#9d86ff", lineWidth: 1 });
      rsiSeries.setData(
        candles
          .map((c, i) => ({ time: c.time as UTCTimestamp, value: rsiVals[i] }))
          .filter((p) => !Number.isNaN(p.value)),
      );
      // 70 / 30 reference lines
      rsiSeries.createPriceLine({ price: 70, color: "#f43f5e", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" });
      rsiSeries.createPriceLine({ price: 30, color: "#22c55e", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" });
      rsiChart.timeScale().fitContent();
    }

    const onResize = () => {
      if (mainRef.current) chart.applyOptions({ width: mainRef.current.clientWidth });
      if (rsiRef.current && rsiChart)
        rsiChart.applyOptions({ width: rsiRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      rsiChart?.remove();
    };
  }, [candles, showEma, showVolume, height]);

  return (
    <div className="space-y-2">
      <div ref={mainRef} className="w-full" />
      <div className="text-[11px] uppercase tracking-wide text-faint">RSI (14)</div>
      <div ref={rsiRef} className="w-full" />
    </div>
  );
}
