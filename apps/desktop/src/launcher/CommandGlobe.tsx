import { useEffect, useRef } from "react";
import { LAND_DOTS } from "../landDots.js";

export interface EraTheme {
  phosphor: string;
  dim: string;
  label: string;
}

// Four real mainline era presets (1953-default/1979-default/1991-default/
// 2019-default, see packages/content/src/packs/index.ts). These restrained
// print colors distinguish eras without turning the launcher into a terminal.
const ERA_THEMES: Record<string, EraTheme> = {
  "1953": { phosphor: "#173f69", dim: "23,63,105", label: "World map · 1953" },
  "1979": { phosphor: "#9a6030", dim: "154,96,48", label: "World map · 1979" },
  "1991": { phosphor: "#526b7d", dim: "82,107,125", label: "World map · 1991" },
  "1999": { phosphor: "#2f6f6a", dim: "47,111,106", label: "World map · 1999" },
  "2007": { phosphor: "#7a5a1e", dim: "122,90,30", label: "World map · 2007" },
  "2019": { phosphor: "#8e2942", dim: "142,41,66", label: "World map · 2019" },
  "2023": { phosphor: "#5a3a8a", dim: "90,58,138", label: "World map · 2023" },
};

const DEFAULT_THEME: EraTheme = ERA_THEMES["1953"]!;

export function themeForEra(eraId: string): EraTheme {
  return ERA_THEMES[eraId] ?? { ...DEFAULT_THEME, label: `World map · ${eraId}` };
}

const CAPITALS: readonly { name: string; lat: number; lon: number }[] = [
  { name: "WASHINGTON", lat: 38.9, lon: -77.0 },
  { name: "LONDON", lat: 51.5, lon: -0.1 },
  { name: "MOSCOW", lat: 55.7, lon: 37.6 },
];

const DEG = Math.PI / 180;

interface Props {
  eraId: string;
  live?: boolean;
}

export function CommandGlobe({ eraId, live = false }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eraRef = useRef<EraTheme>(themeForEra(eraId));
  eraRef.current = themeForEra(eraId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = mql.matches;

    let S = 0;
    let R = 0;
    let dpr = 1;
    let raf = 0;
    let rot = 0;
    let last = performance.now();

    function resize(): void {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      S = canvas!.clientWidth;
      canvas!.width = S * dpr;
      canvas!.height = S * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = S * 0.42;
    }

    function drawFrame(): void {
      const cx = S / 2;
      const cy = S / 2;
      const era = eraRef.current;
      ctx!.clearRect(0, 0, S, S);

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, R + S * 0.055, 0, Math.PI * 2);
      ctx!.clip();
      ctx!.fillStyle = "#eee8dc";
      ctx!.fillRect(0, 0, S, S);

      ctx!.strokeStyle = `rgba(${era.dim},0.18)`;
      ctx!.lineWidth = 1;
      for (let p = -60; p <= 60; p += 30) {
        const lat = p * DEG;
        const y = cy - R * Math.sin(lat);
        const rx = R * Math.cos(lat);
        ctx!.beginPath();
        ctx!.ellipse(cx, y, rx, rx * 0.16, 0, 0, Math.PI * 2);
        ctx!.stroke();
      }
      for (let m = 0; m < 12; m++) {
        const lon0 = rot + (m * Math.PI) / 6;
        ctx!.beginPath();
        let started = false;
        for (let t = -90; t <= 90; t += 4) {
          const lat = t * DEG;
          const x3 = Math.cos(lat) * Math.sin(lon0);
          const y3 = Math.sin(lat);
          const z3 = Math.cos(lat) * Math.cos(lon0);
          if (z3 < 0) {
            started = false;
            continue;
          }
          const x = cx + R * x3;
          const y = cy - R * y3;
          if (!started) {
            ctx!.moveTo(x, y);
            started = true;
          } else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }

      for (let i = 0; i < LAND_DOTS.length; i++) {
        const dot = LAND_DOTS[i]!;
        const lon = dot[0] * DEG + rot;
        const lat = dot[1] * DEG;
        const cosLat = Math.cos(lat);
        const x3 = cosLat * Math.sin(lon);
        const y3 = Math.sin(lat);
        const z3 = cosLat * Math.cos(lon);
        if (z3 < 0.02) continue;
        ctx!.fillStyle = era.phosphor;
        ctx!.globalAlpha = 0.24 + z3 * 0.58;
        ctx!.beginPath();
        ctx!.arc(cx + R * x3, cy - R * y3, 0.9 + z3 * 1.15, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      ctx!.font = "600 9px Georgia, 'Times New Roman', serif";
      for (const c of CAPITALS) {
        const lon = c.lon * DEG + rot;
        const lat = c.lat * DEG;
        const cosLat = Math.cos(lat);
        const x3 = cosLat * Math.sin(lon);
        const y3 = Math.sin(lat);
        const z3 = cosLat * Math.cos(lon);
        if (z3 < 0.25) continue;
        const x = cx + R * x3;
        const y = cy - R * y3;
        ctx!.fillStyle = era.phosphor;
        ctx!.globalAlpha = Math.min(1, z3 + 0.2);
        ctx!.beginPath();
        ctx!.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = `rgba(${era.dim},0.78)`;
        ctx!.fillText(c.name, x + 7, y + 3);
        ctx!.globalAlpha = 1;
      }

      const vg = ctx!.createRadialGradient(cx, cy, R * 0.45, cx, cy, R * 1.08);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, `rgba(${era.dim},0.1)`);
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, S, S);

      ctx!.strokeStyle = `rgba(${era.dim},0.48)`;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();
    }

    function frame(now: number): void {
      if (!reduceMotion && now - last < 1000 / 30) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!reduceMotion) rot += dt * 0.035;
      drawFrame();
      if (!reduceMotion) {
        raf = requestAnimationFrame(frame);
      }
    }

    resize();
    drawFrame();
    if (!reduceMotion) {
      raf = requestAnimationFrame(frame);
    }
    const handleResize = () => {
      resize();
      drawFrame();
    };
    window.addEventListener("resize", handleResize);

    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      if (e.matches) {
        cancelAnimationFrame(raf);
      } else {
        cancelAnimationFrame(raf);
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMotionChange);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onMotionChange);
      }
    };
  }, []);

  const theme = themeForEra(eraId);

  return (
    <div className="launcher-globe-wrap">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="launcher-globe-chip">
        {live ? (
          <>
            <span className="launcher-globe-dot live" aria-hidden="true" />
            Online world
          </>
        ) : (
          <>
            <span
              className="launcher-globe-dot"
              style={{ background: theme.phosphor }}
              aria-hidden="true"
            />
            {theme.label}
          </>
        )}
      </div>
    </div>
  );
}
