export function IconMinimize() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 5H10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconMaximize() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconRestore() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function IconClose() {
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
    );
}

export function WindowControls({
    isMaximized,
    onMinimize,
    onToggleMaximize,
    onClose,
}: {
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}) {
    return (
        <div className="titlebar-window-controls flex h-full shrink-0 items-stretch">
            <div
                className="control-button flex items-center justify-center w-[46px] h-full hover:bg-panel-hover cursor-default transition-colors active:bg-panel-active"
                onClick={onMinimize}
            >
                <IconMinimize />
            </div>
            <div
                className="control-button flex items-center justify-center w-[46px] h-full hover:bg-panel-hover cursor-default transition-colors active:bg-panel-active"
                onClick={onToggleMaximize}
            >
                {isMaximized ? <IconRestore /> : <IconMaximize />}
            </div>
            <div
                className="control-button close-button flex items-center justify-center w-[46px] h-full hover:bg-[#e81123] hover:text-white cursor-default transition-colors active:bg-[#b00d1b]"
                onClick={onClose}
            >
                <IconClose />
            </div>
        </div>
    );
}
