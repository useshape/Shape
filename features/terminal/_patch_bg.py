from pathlib import Path

bg = Path(r"c:/Users/User/Desktop/shape-monorepo/shape/features/terminal/background-run.ts")
text = bg.read_text(encoding="utf-8")

old = """        lastReadyUrl = null;

        const { invoke } = await import(\"@tauri-apps/api/core\");
        console.info(\"[preview] invoking pty_spawn_run\", trimmed);
        const ptyId = await invoke<number>(\"pty_spawn_run\", {
            cwd,
            command: trimmed,
        });
        console.info(\"[preview] pty_spawn_run =>\", ptyId);

        setDevRunPtyId(ptyId);
        const listeners = await attachListeners(ptyId);
"""

new = """        lastReadyUrl = null;

        // Listen for preview-ready BEFORE spawn. Next can boot in <1s; attaching
        // after invoke was racing the event and leaving Design Mode on a white canvas.
        const { listen } = await import(\"@tauri-apps/api/event\");
        const { invoke } = await import(\"@tauri-apps/api/core\");
        let spawnId: number | null = null;
        const earlyReady = await listen<{ id: number; url: string }>(\"preview-ready\", (ev) => {
            if (spawnId !== null && ev.payload.id !== spawnId) return;
            console.info(\"[preview] ready event (early)\", ev.payload.url);
            emitReady(ev.payload.url);
        });

        console.info(\"[preview] invoking pty_spawn_run\", trimmed);
        const ptyId = await invoke<number>(\"pty_spawn_run\", {
            cwd,
            command: trimmed,
        });
        spawnId = ptyId;
        console.info(\"[preview] pty_spawn_run =>\", ptyId);

        setDevRunPtyId(ptyId);
        const listeners = await attachListeners(ptyId);
        earlyReady();
"""

if old not in text:
    raise SystemExit("spawn block not found")
text = text.replace(old, new, 1)
bg.write_text(text, encoding="utf-8")
print("ok background-run")
