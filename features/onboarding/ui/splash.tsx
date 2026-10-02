"use client";

export function OnboardingSplash() {
    return (
        <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="onboard-orb" aria-hidden />
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6">
                <img
                    src="/logos/logo_animated.svg"
                    alt="Shape"
                    width={72}
                    height={72}
                    className="logo-invert size-[72px]"
                />
                <p className="text-sm text-text-muted">Loading</p>
            </div>
        </div>
    );
}
