export type DeployTarget = {
    id: "vercel" | "netlify" | "cloudflare" | "script";
    label: string;
    command: string;
    detectFiles: string[];
    dashboardUrl?: string;
};

export const DEPLOY_TARGETS: DeployTarget[] = [
    {
        id: "vercel",
        label: "Vercel",
        command: "npx vercel --yes",
        detectFiles: ["vercel.json", ".vercel/project.json"],
        dashboardUrl: "https://vercel.com/dashboard",
    },
    {
        id: "netlify",
        label: "Netlify",
        command: "npx netlify deploy --build --prod",
        detectFiles: ["netlify.toml", "netlify.json"],
        dashboardUrl: "https://app.netlify.com",
    },
    {
        id: "cloudflare",
        label: "Cloudflare Pages",
        command: "npx wrangler pages deploy",
        detectFiles: ["wrangler.toml", "wrangler.json"],
        dashboardUrl: "https://dash.cloudflare.com",
    },
    {
        id: "script",
        label: "npm run deploy",
        command: "npm run deploy",
        detectFiles: [],
    },
];

export async function detectDeployTarget(
    projectPath: string,
    lsDir: (path: string) => Promise<{ name: string; is_dir: boolean }[]>,
    readFile: (path: string) => Promise<string>
): Promise<DeployTarget | null> {
    for (const target of DEPLOY_TARGETS) {
        if (target.id === "script") continue;
        for (const file of target.detectFiles) {
            try {
                await readFile(`${projectPath}\\${file}`.replace(/\//g, "\\"));
                return target;
            } catch {
                /* not found */
            }
        }
    }

    try {
        const pkg = JSON.parse(await readFile(`${projectPath}\\package.json`.replace(/\//g, "\\"))) as {
            scripts?: Record<string, string>;
        };
        if (pkg.scripts?.deploy) {
            return DEPLOY_TARGETS.find((t) => t.id === "script") ?? null;
        }
    } catch {
        /* no package.json */
    }

    return null;
}

export function runDeployCommand(command: string) {
    window.dispatchEvent(new CustomEvent("shape-layout-toggle", { detail: { id: "panel", value: true } }));
    window.dispatchEvent(new CustomEvent("shape-terminal-view", { detail: "output" }));
    window.dispatchEvent(
        new CustomEvent("shape-output-append", {
            detail: { channel: "Deploy", text: `$ ${command}\n`, level: "info" },
        })
    );
    window.dispatchEvent(new CustomEvent("shape-terminal-run", { detail: { command } }));
}
