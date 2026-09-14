"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ButtonGroup({
    className,
    vertical = false,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & {
    vertical?: boolean;
}) {
    const items = React.Children.toArray(children).filter(Boolean);
    const last = items.length - 1;

    return (
        <div
            role="group"
            className={cn("inline-flex isolate", vertical ? "flex-col" : "flex-row", className)}
            {...props}
        >
            {items.map((child, i) => {
                if (!React.isValidElement<{ className?: string }>(child)) return child;
                const radius = vertical
                    ? cn(
                          i === 0 && "!rounded-t-md !rounded-b-none",
                          i === last && "!rounded-b-md !rounded-t-none",
                          i !== 0 && i !== last && "!rounded-none",
                          i > 0 && "-mt-px",
                      )
                    : cn(
                          i === 0 && "!rounded-l-md !rounded-r-none",
                          i === last && "!rounded-r-md !rounded-l-none",
                          i !== 0 && i !== last && "!rounded-none",
                          i > 0 && "-ml-px",
                      );
                return React.cloneElement(child, {
                    className: cn("relative focus-visible:z-10", radius, child.props.className),
                });
            })}
        </div>
    );
}
