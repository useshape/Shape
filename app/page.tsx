"use client";

import { useCallback, useState } from "react";

import { openProject } from "@/features/agent";
import {
    WelcomeCloneDialog,
    WelcomeSshDialog,
} from "./welcome-dialogs";
import { useRecentFolders } from "./welcome-screen";

/**
 * Hosts welcome dialogs (clone / SSH). Chat is always mounted in AgentLayout.
 */
export default function Home() {
    const [cloneOpen, setCloneOpen] = useState(false);
    const [sshOpen, setSshOpen] = useState(false);
    const recentFolders = useRecentFolders();

    const handleOpen = useCallback((path: string) => {
        void openProject(path);
    }, []);

    return (
        <>
            <WelcomeCloneDialog
                open={cloneOpen}
                onOpenChange={setCloneOpen}
                recentFolders={recentFolders}
                onCloned={handleOpen}
            />
            <WelcomeSshDialog open={sshOpen} onOpenChange={setSshOpen} />
        </>
    );
}
