export const GENERIC_FONT_FAMILIES = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-sans-serif",
    "ui-serif",
    "ui-monospace",
    "ui-rounded",
    "emoji",
    "math",
    "fangsong",
    "inherit",
    "initial",
    "unset",
]);

export type AddableFont = {
    name: string;
    stack: string;
    google?: boolean;
};

export const ADDABLE_FONTS: AddableFont[] = [
    { name: "Inter", stack: "Inter, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Roboto", stack: "Roboto, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Open Sans", stack: '"Open Sans", ui-sans-serif, system-ui, sans-serif', google: true },
    { name: "Lato", stack: "Lato, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Montserrat", stack: "Montserrat, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Poppins", stack: "Poppins, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Source Sans 3", stack: '"Source Sans 3", ui-sans-serif, sans-serif', google: true },
    { name: "Nunito", stack: "Nunito, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Raleway", stack: "Raleway, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "Outfit", stack: "Outfit, ui-sans-serif, system-ui, sans-serif", google: true },
    { name: "DM Sans", stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif', google: true },
    { name: "Space Grotesk", stack: '"Space Grotesk", ui-sans-serif, sans-serif', google: true },
    { name: "Playfair Display", stack: '"Playfair Display", ui-serif, Georgia, serif', google: true },
    { name: "Merriweather", stack: "Merriweather, ui-serif, Georgia, serif", google: true },
    { name: "IBM Plex Sans", stack: '"IBM Plex Sans", ui-sans-serif, sans-serif', google: true },
    { name: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, monospace', google: true },
    { name: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace', google: true },
    { name: "Fira Code", stack: '"Fira Code", ui-monospace, monospace', google: true },
    { name: "Georgia", stack: "Georgia, ui-serif, serif" },
    { name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
    { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
    { name: "System Sans-Serif", stack: "system-ui, sans-serif" },
];

export function googleFontHref(name: string): string {
    const family = encodeURIComponent(name).replace(/%20/g, "+");
    return `https://fonts.googleapis.com/css2?family=${family}:wght@100..900&display=swap`;
}

export function injectHostFont(name: string) {
    if (typeof document === "undefined") return;
    if (GENERIC_FONT_FAMILIES.has(name.toLowerCase())) return;
    const id = `shape-host-font-${name.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const meta = ADDABLE_FONTS.find((f) => f.name === name);
    if (meta && !meta.google) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = googleFontHref(name);
    document.head.appendChild(link);
}

export function normalizeFontName(name: string): string {
    return name.replace(/^["']|["']$/g, "").trim();
}
