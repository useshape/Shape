import React from "react";

export const AlignStartIcon = ({ axis }: { axis: "x" | "y" }) =>
    axis === "x" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="1" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="6" y="5" width="3" height="5" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="11" y="4" width="3" height="7" rx="1" fill="currentColor" opacity="0.5" />
            <line x1="1" y1="7" x2="0" y2="7" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
    ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="3" y="1" width="8" height="3" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="5" y="6" width="5" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="4" y="11" width="7" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <line x1="7" y1="1" x2="7" y2="0" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
    );

export const AlignCenterIcon = ({ axis }: { axis: "x" | "y" }) =>
    axis === "x" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="2" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="6" y="4" width="3" height="6" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="10" y="2" width="3" height="10" rx="1" fill="currentColor" opacity="0.5" />
            <line x1="7" y1="0" x2="7" y2="14" stroke="currentColor" strokeWidth="0.8" opacity="0.3" strokeDasharray="2 2" />
        </svg>
    ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="3" y="2" width="8" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="4" y="6" width="6" height="3" rx="1" fill="currentColor" opacity="0.9" />
            <rect x="2" y="10" width="10" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="0.8" opacity="0.3" strokeDasharray="2 2" />
        </svg>
    );

export const AlignEndIcon = ({ axis }: { axis: "x" | "y" }) =>
    axis === "x" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="2" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="6" y="5" width="3" height="5" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="10" y="4" width="3" height="7" rx="1" fill="currentColor" opacity="0.9" />
            <line x1="14" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
    ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="3" y="2" width="8" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="5" y="6" width="5" height="3" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="4" y="10" width="7" height="3" rx="1" fill="currentColor" opacity="0.9" />
            <line x1="7" y1="14" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
    );

export const SpaceBetweenIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="0" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
        <rect x="11" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
        <line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="0.8" opacity="0.2" strokeDasharray="2 2" />
    </svg>
);

export const SpaceAroundIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
        <rect x="6" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
        <rect x="10" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9" />
    </svg>
);

export const SpaceEvenlyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="3" width="2.5" height="8" rx="0.75" fill="currentColor" opacity="0.9" />
        <rect x="5.75" y="3" width="2.5" height="8" rx="0.75" fill="currentColor" opacity="0.9" />
        <rect x="10.5" y="3" width="2.5" height="8" rx="0.75" fill="currentColor" opacity="0.9" />
    </svg>
);
