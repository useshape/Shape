import { commands } from "@/lib/backend";

/**
 * Advanced project detection logic to identify web projects.
 * @param path The project root path
 * @returns boolean true if it's likely a web project
 */
export async function isWebProject(path: string): Promise<boolean> {
    try {
        const entries = await commands.lsDir(path);
        if (entries.length === 0) return true;
        const names = entries.map(e => e.name.toLowerCase());
        
        // 1. Direct package manager markers
        const webMarkers = [
            'package.json',
            'pnpm-workspace.yaml',
            'yarn.lock',
            'pnpm-lock.yaml', 
            'bun.lockb',
            'package-lock.json',
            'deno.json',
            'deno.jsonc'
        ];
        if (webMarkers.some(marker => names.includes(marker))) return true;

        // 2. Main Entry files
        const entryFiles = [
            'index.html',
            'main.js',
            'main.ts',
            'app.js',
            'app.ts'
        ];
        if (entryFiles.some(file => names.includes(file))) return true;

        // 3. Framework/Build tool configs
        const configFiles = [
            'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts',
            'next.config.js', 'next.config.mjs', 'next.config.ts',
            'webpack.config.js', 'webpack.config.cjs',
            'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs',
            'postcss.config.js',
            'svelte.config.js',
            'nuxt.config.js', 'nuxt.config.ts',
            'astro.config.mjs',
            'gatsby-config.js',
            'remix.config.js',
            'vue.config.js'
        ];
        if (configFiles.some(file => names.includes(file))) return true;

        // 4. Checking subdirectories (non-recursive for speed)
        // If there's a 'src' or 'public' or 'www' or 'dist' directory, it's often a web project
        const directoryMarkers = ['src', 'public', 'www', 'dist', 'web', 'pages', 'app'];
        const subdirs = entries.filter(e => e.is_dir && directoryMarkers.includes(e.name.toLowerCase()));
        
        if (subdirs.length > 0) {
            // Also check for specific file extensions in root to confirm
            const hasWebExtensions = names.some(name => 
                name.endsWith('.html') || 
                name.endsWith('.css') || 
                name.endsWith('.scss') || 
                name.endsWith('.js') || 
                name.endsWith('.jsx') || 
                name.endsWith('.ts') || 
                name.endsWith('.tsx')
            );
            if (hasWebExtensions) return true;
        }

        // Default to false if no markers are found
        return false;
    } catch (e) {
        console.error("Failed to detect project type:", e);
        // On error, we assume it's fine to avoid blocking the user
        return true; 
    }
}
