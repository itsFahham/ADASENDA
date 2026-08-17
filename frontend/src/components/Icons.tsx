/**
 * Inline Lucide-style icons. Keeping them local avoids an icon dependency and
 * lets every glyph inherit `currentColor`, so they follow the theme for free.
 */

const base = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

export function SendIcon() {
    return (
        <svg {...base}>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
        </svg>
    );
}

export function CheckIcon() {
    return (
        <svg {...base}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

export function ClockIcon() {
    return (
        <svg {...base}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
        </svg>
    );
}

export function ExternalLinkIcon() {
    return (
        <svg {...base} width={14} height={14}>
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
    );
}

export function WalletIcon() {
    return (
        <svg {...base}>
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" />
        </svg>
    );
}

export function ArrowDownIcon() {
    return (
        <svg {...base} width={14} height={14}>
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
        </svg>
    );
}

export function SpinnerIcon() {
    return (
        <svg {...base} className="spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}
