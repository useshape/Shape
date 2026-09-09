"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* Copied from shape/features/chat/ui/blocks/collapse.tsx */

const EXIT_MS = 280;

export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open && !mounted) return null;

  return (
    <div className="chat-collapse" data-open={open && mounted ? "true" : "false"}>
      <div className={cn("chat-collapse-inner", className)}>{children}</div>
    </div>
  );
}
