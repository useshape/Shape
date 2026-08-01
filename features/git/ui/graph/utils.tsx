import React from "react";
import { commands } from "@/lib/backend";

export const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const date = new Date(parseInt(timestamp) * 1000);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}mo ago`;
    return `${Math.floor(diffInMonths / 12)}y ago`;
};

export const renderCommitMessage = (message: string) => {
    // Only match @username if preceded by string start or whitespace, so we don't match foo@bar.com
    const regex = /(?<=^|\s)(@[a-zA-Z0-9_-]+)(?=\s|$|[.,!?])/g;
    return message.split(regex).map((part, i) => {
        if (part.startsWith('@')) {
            const username = part.substring(1);
            return (
                <span
                    key={i}
                    className="text-info hover:underline cursor-pointer"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        commands.openUrlExternal(`https://github.com/${username}`);
                    }}
                >
                    {part}
                </span>
            );
        }
        return part;
    });
};
