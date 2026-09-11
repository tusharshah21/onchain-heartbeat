/** Shape of the last few readings, so the trend is visible, not just the number. */
export default function Sparkline({
  values,
  width = 208,
  height = 40,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const y = (v: number) =>
    height - pad - (Math.min(Math.max(v, 0), 100) / 100) * (height - pad * 2);

  const points = values.map((v, i) => [pad + i * stepX, y(v)] as const);
  const path = points.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `${path} L${points.at(-1)![0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
  const [lastX, lastY] = points.at(-1)!;
  const rising = values.at(-1)! >= values[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Recent activity trend, ${rising ? "rising" : "falling"}, last ${values.length} readings`}
      className="overflow-visible"
    >
      <path d={area} fill="hsl(var(--hue, 190) 90% 60% / 0.12)" />
      <path
        d={path}
        fill="none"
        stroke="hsl(var(--hue, 190) 90% 65% / 0.75)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.4" fill="hsl(var(--hue, 190) 95% 72%)" />
    </svg>
  );
}
