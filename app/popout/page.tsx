"use client";

import { Suspense } from "react";
import PopoutPage from "./popout-page";

export default function PopoutRoute() {
    return (
        <Suspense fallback={null}>
            <PopoutPage />
        </Suspense>
    );
}
