"use client";

// Small dependency-free SVG bar chart — no charting library is installed in
// this project, and a 7-point trend doesn't need one. Kept generic so both
// the revenue and orders charts on the dashboard reuse the same component.
export default function MiniChart({
  data, formatValue, height = 120,
}: { data: { label: string; value: number }[]; formatValue?: (v: number) => string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / data.length;

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Trend chart">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 20);
          return (
            <rect
              key={i}
              x={i * barWidth + barWidth * 0.18}
              y={height - 20 - barHeight}
              width={barWidth * 0.64}
              height={Math.max(barHeight, d.value > 0 ? 2 : 0)}
              className="fill-ink dark:fill-[#f3efe8]"
              rx="1"
            >
              <title>{`${d.label}: ${formatValue ? formatValue(d.value) : d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1.5">
        {data.map((d, i) => (
          <span key={i} className="text-[9.5px] text-stone" style={{ width: `${barWidth}%`, textAlign: "center" }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
