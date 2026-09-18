"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Official Chrome product geometry from google.com/chrome/static/images/chrome-logo.svg. */
export function ChromeBrowserIcon({
    className,
    size = 16,
    branded = false,
}: {
    className?: string;
    size?: number;
    /** Official Chrome red / yellow / green / blue fills. */
    branded?: boolean;
}) {
    const uid = useId().replace(/:/g, "");
    const red = branded ? "#EA4335" : "currentColor";
    const yellow = branded ? "#FBBC04" : "currentColor";
    const green = branded ? "#34A853" : "currentColor";
    const blue = branded ? "#4285F4" : "currentColor";
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 48 48"
            className={cn("shape-icon shrink-0", className)}
            aria-hidden
        >
            <mask id={`${uid}-ring`}>
                <rect width="48" height="48" fill="white" />
                <circle cx="24" cy="24" r="12" fill="black" />
                <circle cx="24" cy="24" r="9.5" fill="white" />
            </mask>
            <g mask={`url(#${uid}-ring)`}>
                <path
                    fill={red}
                    d="M24 12h20.781a23.994 23.994 0 0 0-41.564.003L13.608 30l.009-.002A11.985 11.985 0 0 1 24 12Z"
                />
                <path
                    fill={yellow}
                    d="M34.391 30.003 24.001 48A23.994 23.994 0 0 0 44.78 12.003H23.999l-.003.009a11.985 11.985 0 0 1 10.395 17.991Z"
                />
                <path
                    fill={green}
                    d="M13.609 30.003 3.218 12.006A23.994 23.994 0 0 0 24.003 48L34.393 30.003l-.007-.007a11.985 11.985 0 0 1-20.777.007Z"
                />
                <circle cx="24" cy="24" r="9.5" fill={blue} />
            </g>
        </svg>
    );
}
