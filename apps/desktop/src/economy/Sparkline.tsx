interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}

export function Sparkline({ values, width = 160, height = 36, stroke = "#ededed", fill = "rgba(237,237,237,0.08)" }: SparklineProps) {
  if (values.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#262626" strokeWidth={1} strokeDasharray="3 3" />
      </svg>
    );
  }
  if (values.length === 1) {
    const y = height / 2;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <circle cx={width / 2} cy={y} r={2.5} fill={stroke} />
        <line x1={0} y1={y} x2={width} y2={y} stroke="#262626" strokeWidth={1} strokeDasharray="3 3" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 2;
  const innerH = height - pad * 2;
  const innerW = width - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const normalized = range === 0 ? 0.5 : (v - min) / range;
    const y = pad + (1 - normalized) * innerH;
    return { x, y };
  });

  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaD = `${lineD} L ${points[points.length - 1]!.x.toFixed(2)} ${(height - pad).toFixed(2)} L ${points[0]!.x.toFixed(2)} ${(height - pad).toFixed(2)} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaD} fill={fill} stroke="none" />
      <path d={lineD} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
