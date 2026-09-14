"use client";

import * as React from "react";
import type { RemixiconComponentType } from "@remixicon/react";
import { RiLoader4Line } from "@remixicon/react";
import { Icon, ICON_SIZE_SM } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type ButtonVariant =
    | "default"
    | "confirm"
    | "secondary"
    | "ghost"
    | "outline"
    | "destructive"
    | "danger"
    | "link";
export type ButtonCategory = "primary" | "tertiary";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";
export type ButtonStatus = "idle" | "loading" | "waiting" | "error";

const variantClasses: Record<ButtonVariant, string> = {
    default:
        "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover/90 aria-disabled:bg-accent/50 aria-disabled:text-accent-fg disabled:bg-accent/50 disabled:text-accent-fg",
    confirm:
        "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-hover/90 aria-disabled:bg-accent/50 aria-disabled:text-accent-fg disabled:bg-accent/50 disabled:text-accent-fg",
    secondary:
        "bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary active:bg-panel-active aria-disabled:bg-surface-3 aria-disabled:text-text-disabled disabled:bg-surface-3 disabled:text-text-disabled",
    ghost: "bg-transparent text-text-secondary hover:bg-panel-hover hover:text-text-primary active:bg-panel-active aria-disabled:bg-transparent aria-disabled:text-text-disabled disabled:bg-transparent disabled:text-text-disabled",
    outline:
        "border border-input-border bg-transparent text-text-primary hover:bg-panel-hover active:bg-panel-active aria-disabled:border-border-subtle aria-disabled:text-text-disabled disabled:border-border-subtle disabled:text-text-disabled",
    destructive:
        "bg-error text-white hover:bg-error/90 active:bg-error/80 aria-disabled:bg-error/50 aria-disabled:text-white disabled:bg-error/50 disabled:text-white",
    danger: "bg-error text-white hover:bg-error/90 active:bg-error/80 aria-disabled:bg-error/50 aria-disabled:text-white disabled:bg-error/50 disabled:text-white",
    link: "bg-transparent px-0 text-accent underline-offset-2 hover:underline hover:text-accent-hover active:text-accent-hover aria-disabled:text-text-disabled disabled:text-text-disabled",
};

const tertiaryOverride: Partial<Record<ButtonVariant, string>> = {
    default: "bg-transparent text-accent hover:bg-panel-hover hover:text-accent-hover",
    confirm: "bg-transparent text-accent hover:bg-panel-hover hover:text-accent-hover",
    secondary: "bg-transparent text-text-secondary hover:bg-panel-hover hover:text-text-primary",
    destructive: "bg-transparent text-error hover:bg-error/10 hover:text-error",
    danger: "bg-transparent text-error hover:bg-error/10 hover:text-error",
};

const sizeClasses: Record<ButtonSize, string> = {
    xs: "h-7 min-h-7 px-2.5 text-xs rounded-md",
    sm: "h-7.5 min-h-7.5 px-3 text-sm rounded-md",
    md: "h-8 min-h-8 px-3.5 text-sm rounded-lg",
    lg: "h-10 min-h-10 px-4 text-base rounded-lg",
    icon: "size-7 min-h-7 min-w-7 shrink-0 overflow-visible p-0 rounded-md",
};

const selectedClasses =
    "bg-panel-active text-text-primary hover:bg-panel-active hover:text-text-primary";

const spinnerClass: Record<ButtonSize, string> = {
    xs: "imsg-typing imsg-typing-sm",
    sm: "imsg-typing imsg-typing-sm",
    md: "imsg-typing imsg-typing-sm",
    lg: "imsg-typing",
    icon: "imsg-typing imsg-typing-sm",
};

/** Same three-dot indicator as an AI message while generating. */
export function ButtonSpinner({
    className,
    size = "md",
}: {
    className?: string;
    size?: ButtonSize;
}) {
    return (
        <span
            className={cn(spinnerClass[size], "[&_span]:bg-current", className)}
            role="status"
            aria-label="Loading"
        >
            <span />
            <span />
            <span />
        </span>
    );
}

function LoadingGlyph({ size }: { size: ButtonSize }) {
    return (
        <Icon
            icon={RiLoader4Line}
            size={size === "lg" ? 18 : ICON_SIZE_SM}
            className="animate-spin"
        />
    );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    category?: ButtonCategory;
    size?: ButtonSize;
    /** Visual / busy state. `loading` and `waiting` show the AI-message typing dots. */
    status?: ButtonStatus;
    /** GitLab-style spinner; keeps the control focusable. */
    loading?: boolean;
    selected?: boolean;
    block?: boolean;
    icon?: RemixiconComponentType;
    count?: number;
    countSrText?: string;
    /** Render a non-interactive span styled as a button (button-group labels). */
    label?: boolean;
    href?: string;
    /**
     * Keep the button in tab order while inactive (`aria-disabled`).
     * Default true, matching Pajamas. Set false for native `disabled`.
     */
    accessibleDisabled?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = "default",
            category = "primary",
            size = "md",
            status = "idle",
            loading = false,
            selected = false,
            block = false,
            icon,
            count,
            countSrText,
            label = false,
            href,
            accessibleDisabled = true,
            type = "button",
            disabled,
            children,
            onClick,
            onKeyDown,
            "aria-pressed": ariaPressed,
            ...props
        },
        ref,
    ) => {
        const aiBusy = status === "loading" || status === "waiting";
        const spinnerLoading = loading && !aiBusy;
        const inactive = Boolean(disabled) || loading || aiBusy;
        const resolvedVariant = status === "error" ? "destructive" : variant;
        const iconOnly = Boolean(icon) && children == null;
        const useNativeDisabled = inactive && !accessibleDisabled && !href && !label;
        const ariaDisabled = inactive && !useNativeDisabled;

        const classes = cn(
            "relative inline-flex items-center justify-center gap-1.5 font-medium outline-none select-none",
            "transition-colors duration-[var(--transition-fast)] ease-[var(--ease-out)]",
            "focus-visible:ring-1 focus-visible:ring-border-focus",
            "[&_svg.shape-icon]:pointer-events-none [&_svg.shape-icon]:shrink-0",
            variantClasses[resolvedVariant],
            category === "tertiary" && tertiaryOverride[resolvedVariant],
            sizeClasses[iconOnly && size !== "icon" ? size : iconOnly ? "icon" : size],
            iconOnly && size !== "icon" && "px-0 aspect-square",
            selected && selectedClasses,
            block && "w-full",
            (inactive || label) && "cursor-not-allowed",
            label && "cursor-default select-text pointer-events-none bg-surface-2 text-text-secondary hover:bg-surface-2",
            className,
        );

        const content = aiBusy ? (
            <>
                <span className="invisible inline-flex items-center justify-center gap-1.5">
                    {icon ? <Icon icon={icon} size={ICON_SIZE_SM} /> : null}
                    {children}
                </span>
                <span className="absolute inset-0 flex items-center justify-center">
                    <ButtonSpinner size={iconOnly ? "icon" : size} />
                </span>
            </>
        ) : (
            <>
                {spinnerLoading ? <LoadingGlyph size={size} /> : icon && !iconOnly ? <Icon icon={icon} size={ICON_SIZE_SM} /> : null}
                {spinnerLoading && iconOnly ? null : iconOnly ? <Icon icon={icon!} size={ICON_SIZE_SM} /> : null}
                {children}
                {count != null ? (
                    <span className="ml-0.5 tabular-nums text-xs text-current/80">
                        {count}
                        {countSrText ? <span className="sr-only"> {countSrText}</span> : null}
                    </span>
                ) : null}
            </>
        );

        const shared = {
            className: classes,
            "aria-busy": loading || aiBusy || undefined,
            "aria-pressed": selected ? true : ariaPressed,
            "aria-disabled": ariaDisabled || undefined,
        };

        const guardActivation = (event: React.SyntheticEvent) => {
            if (!inactive) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
        };

        if (label) {
            return (
                <span ref={ref as React.Ref<HTMLSpanElement>} className={classes}>
                    {content}
                </span>
            );
        }

        if (href) {
            return (
                <a
                    ref={ref as React.Ref<HTMLAnchorElement>}
                    href={ariaDisabled ? undefined : href}
                    className={classes}
                    aria-busy={shared["aria-busy"]}
                    aria-disabled={ariaDisabled || undefined}
                    role={href === "#" ? "button" : undefined}
                    tabIndex={ariaDisabled ? -1 : 0}
                    onClick={(e) => {
                        if (guardActivation(e)) return;
                        onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
                    }}
                >
                    {content}
                </a>
            );
        }

        return (
            <button
                ref={ref}
                type={type}
                disabled={useNativeDisabled || undefined}
                {...props}
                className={classes}
                aria-busy={shared["aria-busy"]}
                aria-pressed={shared["aria-pressed"]}
                aria-disabled={ariaDisabled || undefined}
                onClick={(e) => {
                    if (guardActivation(e)) return;
                    onClick?.(e);
                }}
                onKeyDown={(e) => {
                    if (inactive && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        return;
                    }
                    onKeyDown?.(e);
                }}
            >
                {content}
            </button>
        );
    },
);

Button.displayName = "Button";

export { ButtonGroup } from "./button-group";
