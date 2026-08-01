import { commands } from "@/lib/backend";

export interface ProjectFrameworks {
    hasReact: boolean;
    hasVue: boolean;
    hasAngular: boolean;
    hasSvelte: boolean;
    hasNextjs: boolean;
    hasTailwind: boolean;
    hasTypescript: boolean;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    tailwindConfigContent?: string;
}

export async function detectFrameworks(projectPath: string | null): Promise<ProjectFrameworks> {
    const result: ProjectFrameworks = {
        hasReact: false,
        hasVue: false,
        hasAngular: false,
        hasSvelte: false,
        hasNextjs: false,
        hasTailwind: false,
        hasTypescript: false,
        dependencies: {},
        devDependencies: {},
    };

    if (!projectPath) return result;

    try {
        const packageJsonStr = await commands.readFile(`${projectPath}/package.json`);
        const pkg = JSON.parse(packageJsonStr);
        
        result.dependencies = pkg.dependencies || {};
        result.devDependencies = pkg.devDependencies || {};

        const allDeps = { ...result.dependencies, ...result.devDependencies };

        result.hasReact = !!allDeps['react'];
        result.hasVue = !!allDeps['vue'];
        result.hasAngular = !!allDeps['@angular/core'];
        result.hasSvelte = !!allDeps['svelte'];
        result.hasNextjs = !!allDeps['next'];
        result.hasTailwind = !!allDeps['tailwindcss'];
        result.hasTypescript = !!allDeps['typescript'];

        // Optionally read tailwind config
        if (result.hasTailwind) {
            try {
                const twPath = `${projectPath}/tailwind.config.js`;
                const twPathTs = `${projectPath}/tailwind.config.ts`;
                try {
                    result.tailwindConfigContent = await commands.readFile(twPath);
                } catch {
                    result.tailwindConfigContent = await commands.readFile(twPathTs);
                }
            } catch {
                // Ignore missing config
            }
        }
    } catch {
        // package.json might not exist, ignore
    }

    return result;
}
