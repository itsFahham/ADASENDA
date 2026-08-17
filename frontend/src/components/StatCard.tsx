import type { ReactNode } from "react";

interface Props {
    label: string;
    value: ReactNode;
    unit?: string;
    hint?: string;
    accent?: boolean;
}

export function StatCard({ label, value, unit, hint, accent }: Props) {
    return (
        <div className={`stat${accent ? " stat-accent" : ""}`}>
            <span className="stat-label">{label}</span>
            <span className="stat-value">
                {value}
                {unit && <span className="stat-unit">{unit}</span>}
            </span>
            {hint && <span className="stat-hint">{hint}</span>}
        </div>
    );
}
