/**
 * Explicitly register Monaco Monarch language packs so production bundlers
 * cannot tree-shake them away. Importing the aggregate contribution pulls in
 * every built-in language Monaco ships (web, systems, scripting, etc.).
 */
export async function registerBundledMonacoLanguages(): Promise<void> {
    // Side-effect import — registers all Monaco basic-languages.
    // No published types for this deep path.
    // @ts-expect-error monaco ships JS-only contribution entry
    await import("monaco-editor/esm/vs/basic-languages/monaco.contribution.js");
}
