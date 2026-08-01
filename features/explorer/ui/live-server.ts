import { invoke } from "@tauri-apps/api/core";
import { notify } from "@/features/notifications";
import { commands } from "@/lib/backend";

let liveServerPtyId: number | null = null;

export async function startLiveServer(dir: string, fileName: string) {
    if (liveServerPtyId !== null) {
        try {
            await invoke("pty_kill", { id: liveServerPtyId });
        } catch { }
    }

    try {
        notify.info("Live Server", `Starting live server in ${dir}...`);

        liveServerPtyId = await invoke<number>("pty_spawn", {
            cwd: dir,
            shell: "powershell",
            rows: 24,
            cols: 80,
        });

        await invoke("pty_write", {
            id: liveServerPtyId,
            data: "npx -y http-server -p 5500 -c-1\r",
        });

        setTimeout(async () => {
            notify.success("Live Server", "Live server started on port 5500");
            const fileUrl = encodeURI(`http://localhost:5500/${fileName}`);
            await commands.openUrlExternal(fileUrl);
            window.dispatchEvent(new CustomEvent("shape-layout-toggle", {
                detail: { id: "panel", value: true },
            }));
        }, 1500);
    } catch (e) {
        notify.error("Live Server Error", String(e));
    }
}
