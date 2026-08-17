import { useId, useState } from "react";

export interface Point {
    label: string;
    value: number;
}

interface Props {
    points: Point[];
    unit?: string;
    /** Screen-reader summary of what the line represents. */
    caption: string;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = { top: 12, right: 4, bottom: 4, left: 4 };

/**
 * Small dependency-free area chart. Values are mapped into a fixed viewBox and
 * the SVG scales with its container, so it stays sharp at any width.
 */
export function AreaChart({ points, unit = "", caption }: Props) {
    const gradientId = useId();
    const [hovered, setHovered] = useState<number | null>(null);

    if (points.length < 2) {
        return <p className="chart-empty">Not enough data yet.</p>;
    }

    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat line would divide by zero, so give it an artificial range.
    const range = max - min || Math.abs(max) || 1;

    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const coords = points.map((point, i) => ({
        ...point,
        x: PADDING.left + (i / (points.length - 1)) * innerWidth,
        // Leave 12% headroom so the peak never touches the top edge.
        y: PADDING.top + innerHeight - ((point.value - min) / range) * innerHeight * 0.88,
    }));

    const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area = `${PADDING.left},${HEIGHT} ${line} ${(WIDTH - PADDING.right).toFixed(1)},${HEIGHT}`;

    const active = hovered !== null ? coords[hovered] : null;

    return (
        <figure className="chart">
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={caption}
                onMouseLeave={() => setHovered(null)}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
                    </linearGradient>
                </defs>

                <polygon points={area} fill={`url(#${gradientId})`} />
                <polyline
                    points={line}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />

                {active && (
                    <>
                        <line
                            x1={active.x}
                            y1={0}
                            x2={active.x}
                            y2={HEIGHT}
                            stroke="var(--border-strong)"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle
                            cx={active.x}
                            cy={active.y}
                            r="4"
                            fill="var(--surface)"
                            stroke="var(--chart-1)"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </>
                )}

                {/* Invisible hit areas: one column per point, so hovering anywhere works. */}
                {coords.map((c, i) => (
                    <rect
                        key={c.label + i}
                        x={c.x - innerWidth / (points.length - 1) / 2}
                        y={0}
                        width={innerWidth / (points.length - 1)}
                        height={HEIGHT}
                        fill="transparent"
                        onMouseEnter={() => setHovered(i)}
                    />
                ))}
            </svg>

            <figcaption className="chart-legend">
                {active ? (
                    <>
                        <strong>
                            {active.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            {unit}
                        </strong>
                        <span>{active.label}</span>
                    </>
                ) : (
                    <>
                        <span>{points[0]!.label}</span>
                        <span>{points[points.length - 1]!.label}</span>
                    </>
                )}
            </figcaption>
        </figure>
    );
}
