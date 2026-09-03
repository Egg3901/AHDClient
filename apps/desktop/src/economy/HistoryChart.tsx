import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * U12: canvas-drawn history line chart (no chart library — hand-rolled
 * 2D-canvas rendering, per the wave brief). Reads pre-computed series
 * (already range-sliced by the caller via economy/history.ts selectors) and
 * draws a single shared y-axis with one or more lines, a legend when there
 * is more than one series (a single series is named by its section title,
 * per the dataviz convention this app already follows for the sparkline
 * cards), and a hover crosshair + readout — the "ship interactivity by
 * default" rule for any line/area chart.
 */

export interface HistoryChartPoint {
  turn: number;
  value: number;
}

export interface HistoryChartSeries {
  id: string;
  label: string;
  color: string;
  points: HistoryChartPoint[];
}

interface HistoryChartProps {
  series: HistoryChartSeries[];
  height?: number;
  valueFormat?: (v: number) => string;
  turnFormat?: (turn: number) => string;
  emptyLabel?: string;
}

const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 10;

export function HistoryChart({ series, height = 180, valueFormat, turnFormat, emptyLabel = "collecting history…" }: HistoryChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(560);
  const [hoverTurn, setHoverTurn] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allTurns = useMemo(() => {
    const set = new Set<number>();
    for (const s of series) for (const p of s.points) set.add(p.turn);
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);

  const hasData = allTurns.length > 0;

  const { min, max } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.value < mn) mn = p.value;
        if (p.value > mx) mx = p.value;
      }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = 0;
      mx = 1;
    }
    if (mn === mx) {
      mn -= Math.abs(mn) * 0.1 + 1;
      mx += Math.abs(mx) * 0.1 + 1;
    }
    return { min: mn, max: mx };
  }, [series]);

  const turnMin = allTurns[0] ?? 0;
  const turnMax = allTurns[allTurns.length - 1] ?? 1;
  const turnSpan = Math.max(1, turnMax - turnMin);

  const xFor = (turn: number, innerW: number): number => PAD_L + ((turn - turnMin) / turnSpan) * innerW;
  const yFor = (value: number, innerH: number): number => PAD_T + (1 - (value - min) / (max - min)) * innerH;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const innerW = Math.max(1, width - PAD_L - PAD_R);
    const innerH = Math.max(1, height - PAD_T - PAD_B);

    if (!hasData) {
      ctx.strokeStyle = "#2a2a3d";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, height / 2);
      ctx.lineTo(width - PAD_R, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    // Recessive gridlines at 0/50/100% of the value range.
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 1;
    for (const frac of [0, 0.5, 1]) {
      const y = Math.round(PAD_T + frac * innerH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(width - PAD_R, y);
      ctx.stroke();
    }

    for (const s of series) {
      if (s.points.length === 0) continue;
      ctx.lineWidth = 2;
      ctx.strokeStyle = s.color;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = xFor(p.turn, innerW);
        const y = yFor(p.value, innerH);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (hoverTurn !== null) {
      const hx = xFor(hoverTurn, innerW);
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(hx) + 0.5, PAD_T);
      ctx.lineTo(Math.round(hx) + 0.5, height - PAD_B);
      ctx.stroke();
      for (const s of series) {
        const p = s.points.find((pp) => pp.turn === hoverTurn);
        if (!p) continue;
        const y = yFor(p.value, innerH);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(hx, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, height, hoverTurn, hasData, turnMin, turnMax, turnSpan, min, max]);

  const handleMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const innerW = Math.max(1, width - PAD_L - PAD_R);
    const frac = Math.min(1, Math.max(0, (x - PAD_L) / innerW));
    const rawTurn = turnMin + frac * turnSpan;
    let nearest = allTurns[0]!;
    let bestDist = Infinity;
    for (const t of allTurns) {
      const d = Math.abs(t - rawTurn);
      if (d < bestDist) {
        bestDist = d;
        nearest = t;
      }
    }
    setHoverTurn(nearest);
  };

  const handleLeave = () => setHoverTurn(null);

  const innerW = Math.max(1, width - PAD_L - PAD_R);
  const tooltipLeft = hoverTurn !== null ? Math.min(width - 90, Math.max(90, xFor(hoverTurn, innerW))) : 0;

  return (
    <div className="hist-chart" ref={containerRef}>
      {series.length > 1 && (
        <div className="hist-chart-legend">
          {series.map((s) => (
            <span key={s.id} className="hist-chart-legend-item">
              <span className="hist-chart-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="hist-chart-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="hist-chart-canvas"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        />
        {!hasData && <div className="hist-chart-empty muted small">{emptyLabel}</div>}
        {hoverTurn !== null && (
          <div className="hist-chart-tooltip" style={{ left: tooltipLeft }}>
            <div className="hist-chart-tooltip-turn">{turnFormat ? turnFormat(hoverTurn) : `Turn ${hoverTurn}`}</div>
            {series.map((s) => {
              const p = s.points.find((pp) => pp.turn === hoverTurn);
              if (!p) return null;
              return (
                <div key={s.id} className="hist-chart-tooltip-row">
                  <span className="hist-chart-swatch" style={{ background: s.color }} />
                  <span className="hist-chart-tooltip-label">{s.label}</span>
                  <span className="hist-chart-tooltip-value">{valueFormat ? valueFormat(p.value) : p.value.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
