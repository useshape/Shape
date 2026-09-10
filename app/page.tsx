"use client";

import { useCallback, useEffect, useState } from "react";

import { useProjectState } from "@/lib/backend";
import { openProject } from "@/features/agent";
import {
    WelcomeCloneDialog,
    WelcomeOpenDialog,
    WelcomeSshDialog,
} from "./welcome-dialogs";
import { WelcomeScreen, useRecentFolders } from "./welcome-screen";
import { loginGitHub } from "@/lib/github/store";
import { getProjectSnapshot } from "@/lib/backend";

/**
 * Agent window home — welcome when idle.
 * Project open is owned by Main's ProjectOpenHost (always mounted).
 */
export default function Home() {
    const { project_path } = useProjectState();
    const [cloneOpen, setCloneOpen] = useState(false);
    const [openProjectOpen, setOpenProjectOpen] = useState(false);
    const [sshOpen, setSshOpen] = useState(false);
    const recentFolders = useRecentFolders();
    const [restoringProject, setRestoringProject] = useState(
        () => !getProjectSnapshot().project_path,
    );

    useEffect(() => {
        if (project_path) setRestoringProject(false);
    }, [project_path]);

    useEffect(() => {
        // Brief wait for Main's restore; then show welcome if still empty.
        const t = window.setTimeout(() => setRestoringProject(false), 800);
        return () => window.clearTimeout(t);
    }, []);

    const handleOpen = useCallback((path: string) => {
        void openProject(path);
    }, []);

    const dialogs = (
        <>
            <WelcomeOpenDialog
                open={openProjectOpen}
                onOpenChange={setOpenProjectOpen}
                recentFolders={recentFolders}
                onOpen={handleOpen}
            />
            <WelcomeCloneDialog
                open={cloneOpen}
                onOpenChange={setCloneOpen}
                recentFolders={recentFolders}
                onCloned={handleOpen}
            />
            <WelcomeSshDialog open={sshOpen} onOpenChange={setSshOpen} />
        </>
    );

    if (restoringProject && !project_path) {
        return (
            <div className="flex h-full items-center justify-center bg-editor text-sm text-text-muted">
                Opening project…
            </div>
        );
    }

    // Keep mounted (dialogs) while project open so welcome dialogs still work.
    if (project_path) {
        return dialogs;
    }

    return (
        <>
            <WelcomeScreen
                recentFolders={recentFolders}
                onOpenProject={handleOpen}
                onPickFolder={() => setOpenProjectOpen(true)}
                onClone={() => setCloneOpen(true)}
                onSsh={() => setSshOpen(true)}
                onConnectGitHub={() => void loginGitHub()}
            />
            {dialogs}
        </>
    );
}
