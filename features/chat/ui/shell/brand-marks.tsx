"use client";

import { RiCursorAiFill, RiFolder3Fill } from "@remixicon/react";
import { Icon } from "@/components/ui/icon";

function SimpleMark({
    slug,
    color,
    size = 16,
}: {
    slug: string;
    color: string;
    size?: number;
}) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={`https://cdn.simpleicons.org/${slug}/${color}`}
            alt=""
            width={size}
            height={size}
            className="shrink-0 object-contain"
            style={{ width: size, height: size }}
            draggable={false}
        />
    );
}

export function CursorMark({ size = 16 }: { size?: number }) {
    return (
        <Icon
            icon={RiCursorAiFill}
            size={size}
            className="shrink-0 text-white"
            style={{ color: "#FFFFFF" }}
        />
    );
}

export function VsCodeMark({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="shrink-0"
            aria-hidden
        >
            <path
                fill="#007ACC"
                d="M23.15 2.587 18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.275.065L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.275.065l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448z"
            />
        </svg>
    );
}

export function ZedMark({ size = 16 }: { size?: number }) {
    const inner = Math.max(9, size - 5);
    return (
        <span
            className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-white"
            style={{ width: size, height: size }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="https://cdn.simpleicons.org/zedindustries/000000"
                alt=""
                width={inner}
                height={inner}
                className="object-contain"
                draggable={false}
            />
        </span>
    );
}

export function ExplorerMark({ size = 16 }: { size?: number }) {
    return (
        <Icon
            icon={RiFolder3Fill}
            className="shrink-0"
            style={{ width: size, height: size, color: "#E8A317" }}
        />
    );
}

export function GitHubMark({ size = 16 }: { size?: number }) {
    return <SimpleMark slug="github" color="FFFFFF" size={size} />;
}

export function GitLabMark({ size = 16 }: { size?: number }) {
    return <SimpleMark slug="gitlab" color="FC6D26" size={size} />;
}

export function AzureDevOpsMark({ size = 16 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="shrink-0"
            aria-hidden
        >
            <path
                fill="#0078D4"
                d="M0 8.889 7.556 2.667v13.778L0 8.889Zm8.889-4.445v13.334L24 21.333V2.667L8.889 4.444Z"
            />
        </svg>
    );
}

export function BitbucketMark({ size = 16 }: { size?: number }) {
    return <SimpleMark slug="bitbucket" color="2684FF" size={size} />;
}

export function GitUrlMark({ size = 16 }: { size?: number }) {
    return <SimpleMark slug="git" color="F05032" size={size} />;
}
