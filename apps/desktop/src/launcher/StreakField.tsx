import { useEffect, useRef } from "react";

const PAPER_RGB = "250,250,250";
const COLORS: readonly string[] = ["#b3232a", "#1f3f9e"] as const;
const SPEED = 340;
const COUNT = 6;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

class Agent {
  color: string;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  mode: "wander" | "check1" | "check2" = "wander";
  timer = 0;
  width = 1.6;

  constructor(
    i: number,
    private readonly W: () => number,
    private readonly H: () => number,
  ) {
    this.color = COLORS[i % 2]!;
  }

  init(W: number, H: number): void {
    this.x = rand(0, W);
    this.y = rand(0, H);
    this.setDir(rand(0, Math.PI * 2));
    this.mode = "wander";
    this.timer = rand(1.2, 4);
    this.width = 1.6;
  }

  setDir(theta: number): void {
    this.vx = Math.cos(theta) * SPEED;
    this.vy = Math.sin(theta) * SPEED;
  }

  step(
    dt: number,
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.mode === "wander") {
        if (
          Math.random() < 0.34 &&
          this.x > W * 0.08 &&
          this.x < W * 0.8 &&
          this.y > H * 0.1 &&
          this.y < H * 0.85
        ) {
          this.mode = "check1";
          this.timer = 0.16;
          this.width = 2.6;
          this.setDir(Math.PI / 3.6);
        } else {
          this.timer = rand(1.2, 4);
          this.setDir(rand(0, Math.PI * 2));
        }
      } else if (this.mode === "check1") {
        this.mode = "check2";
        this.timer = 0.34;
        this.setDir(-Math.PI / 4.2);
      } else {
        this.mode = "wander";
        this.timer = rand(1.6, 4.5);
        this.width = 1.6;
        this.setDir(rand(0, Math.PI * 2));
      }
    }
    const px = this.x;
    const py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > W) {
      this.vx *= -1;
      this.x = Math.max(0, Math.min(W, this.x));
    }
    if (this.y < 0 || this.y > H) {
      this.vy *= -1;
      this.y = Math.max(0, Math.min(H, this.y));
    }
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.width;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
  }
}

export function StreakField(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();

    const agents: Agent[] = Array.from(
      { length: COUNT },
      (_, i) => new Agent(i, () => W, () => H),
    );

    function resize(): void {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas!.clientWidth;
      H = canvas!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = `rgb(${PAPER_RGB})`;
      ctx!.fillRect(0, 0, W, H);
      ctx!.lineCap = "round";
      for (const a of agents) a.init(W, H);
    }

    function frame(now: number): void {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx!.fillStyle = `rgba(${PAPER_RGB},0.085)`;
      ctx!.fillRect(0, 0, W, H);
      for (const a of agents) a.step(dt, ctx!, W, H);
      raf = requestAnimationFrame(frame);
    }

    resize();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    const onMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    // older Safari uses addListener
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMotionChange);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", onMotionChange);
      }
    };
  }, []);

  return <canvas ref={ref} className="launcher-streaks" aria-hidden="true" />;
}
