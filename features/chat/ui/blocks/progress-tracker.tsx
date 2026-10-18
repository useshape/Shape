"use client";

export type ProgressStep = {
    id: string;
    label: string;
    done?: boolean;
    active?: boolean;
};

/** Task checklist. Steps follow the plan; they do not tick themselves. */
export function ProgressTracker({
    title = "Tasks",
    steps,
}: {
    title?: string;
    steps: ProgressStep[];
}) {
    const total = steps.length;
    const count = steps.filter((step) => step.done).length;
    const progress = total ? count / total : 0;
    if (total === 0) return null;

    return (
        <div className="ui-progressc" data-complete={count === total || undefined}>
            <div className="ui-progressc__head">
                <h3 className="ui-progressc__title">{title}</h3>
                <span className="ui-progressc__count" aria-hidden="true">
                    <span className="ui-progressc__digit" key={count}>{count}</span>
                    /{total}
                </span>
            </div>
            <div
                className="ui-progressc__bar"
                role="progressbar"
                aria-label={title}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={count}
                aria-valuetext={`${count} of ${total} done`}
            >
                <span className="ui-progressc__fill" style={{ transform: `scaleX(${progress})` }}>
                    <span className="ui-progressc__shine" key={count} />
                </span>
            </div>
            <ul className="ui-progressc__list">
                {steps.map((step, index) => (
                    <li key={step.id} style={{ animationDelay: `${180 + index * 90}ms` }}>
                        <div
                            className="ui-progressc__step"
                            data-done={step.done || undefined}
                            data-active={step.active || undefined}
                        >
                            <span className="ui-progressc__check" aria-hidden="true">
                                <svg viewBox="0 0 24 24">
                                    <path d="M6.5 12.5l3.5 3.5 7.5-8" pathLength={1} />
                                </svg>
                            </span>
                            <span className="ui-progressc__label">
                                <span>{step.label}</span>
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
