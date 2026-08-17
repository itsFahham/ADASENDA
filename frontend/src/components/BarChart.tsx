import { useState } from "react";
import type { Point } from "./AreaChart";

interface Props {
    points: Point[];
    unit?: string;
    caption: string;
}

/**
 * Horizontal-scaling bar chart built from plain divs rather than SVG: bars are
 * simple rectangles, so CSS handles the sizing and hover states for free.
 */
export function BarChart({ points, unit = "", caption }: Props) {
    const [hovered, setHovered] = useState<number | null>(null);

    if (points.length === 0) {
        return <p className="chart-empty">Not enough data yet.</p>;
    }

    const max = Math.max(...points.map((p) => p.value)) || 1;
    const active = hovered !== null ? points[hovered] : null;

    return (
        <figure className="chart">
            <div className="bars" role="img" aria-label={caption}>
                {points.map((point, i) => (
                    <div
                        key={point.label + i}
                        className="bar-slot"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <div
                            className="bar"
                            style={{ height: `${Math.max((point.value / max) * 100, 4)}%` }}
                        />
                    </div>
                ))}
            </div>

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
                        <span>oldest</span>
                        <span>newest</span>
                    </>
                )}
            </figcaption>
        </figure>
    );
}
