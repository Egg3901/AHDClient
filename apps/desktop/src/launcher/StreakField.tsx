import { useEffect, useRef } from "react";

const PAPER_RGB = "247,244,236";
const COLORS: readonly string[] = ["#ad2831", "#244a9b"] as const;
const AGENT_COUNT = 4;
const SPEED = 180;

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

class Streak {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private turnIn = 0;

  constructor(private readonly color: string) {}

  reset(width: number, height: number): void {
    this.x = between(0, width);
    this.y = between(0, height);
    this.point(between(0, Math.PI * 2));
    this.turnIn = between(1.8, 5.2);
  }

  private point(angle: number): void {
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
  }

  draw(
    seconds: number,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    this.turnIn -= seconds;
    if (this.turnIn <= 0) {
      const heading = Math.atan2(this.vy, this.vx) + between(-0.8, 0.8);
      this.point(heading);
      this.turnIn = between(1.8, 5.2);
    }

    const previousX = this.x;
    const previousY = this.y;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;

    if (this.x <= 0 || this.x >= width) {
      this.vx *= -1;
      this.x = Math.max(0, Math.min(width, this.x));
    }
    if (this.y <= 0 || this.y >= height) {
      this.vy *= -1;
      this.y = Math.max(0, Math.min(height, this.y));
    }

    context.strokeStyle = this.color;
    context.lineWidth = 1.35;
    context.beginPath();
    context.moveTo(previousX, previousY);
    context.lineTo(this.x, this.y);
    context.stroke();
  }
}

export function StreakField(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionPreference.matches;
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let previousTime = performance.now();

    const streaks = Array.from(
      { length: AGENT_COUNT },
      (_, index) => new Streak(COLORS[index % COLORS.length]!),
    );

    function resize(): void {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = Math.round(width * pixelRatio);
      canvas!.height = Math.round(height * pixelRatio);
      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context!.fillStyle = `rgb(${PAPER_RGB})`;
      context!.fillRect(0, 0, width, height);
      context!.lineCap = "round";
      streaks.forEach((streak) => streak.reset(width, height));
    }

    function frame(now: number): void {
      const elapsed = Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      context!.fillStyle = `rgba(${PAPER_RGB},0.045)`;
      context!.fillRect(0, 0, width, height);
      streaks.forEach((streak) => streak.draw(elapsed, context!, width, height));
      if (!reduceMotion && !document.hidden) {
        animationFrame = requestAnimationFrame(frame);
      }
    }

    function start(): void {
      cancelAnimationFrame(animationFrame);
      if (!reduceMotion && !document.hidden) {
        previousTime = performance.now();
        animationFrame = requestAnimationFrame(frame);
      }
    }

    function onMotionChange(event: MediaQueryListEvent): void {
      reduceMotion = event.matches;
      start();
    }

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    motionPreference.addEventListener?.("change", onMotionChange);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", start);
      motionPreference.removeEventListener?.("change", onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="launcher-streaks" aria-hidden="true" />;
}
