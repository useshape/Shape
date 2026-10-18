"use client";

import { AssistantMark } from "../message/bubble";

/** Face sits on the tool row. The spinner ring is on the model badge, not the face. */
export function GeneratingIndicator({
    label: _label,
    model,
}: {
    label?: string;
    showTimer?: boolean;
    variantSeed?: string;
    model?: string;
}) {
    return <AssistantMark model={model} />;
}
