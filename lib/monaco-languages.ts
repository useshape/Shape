export type MonacoLanguageOption = {
    id: string;
    label: string;
};

/** Languages Shape ships with (Monaco Monarch — no extension installs). */
export const MONACO_LANGUAGE_OPTIONS: MonacoLanguageOption[] = [
    { id: "plaintext", label: "Plain Text" },
    { id: "typescript", label: "TypeScript" },
    { id: "javascript", label: "JavaScript" },
    { id: "json", label: "JSON" },
    { id: "html", label: "HTML" },
    { id: "css", label: "CSS" },
    { id: "scss", label: "SCSS" },
    { id: "less", label: "Less" },
    { id: "handlebars", label: "Handlebars" },
    { id: "pug", label: "Pug" },
    { id: "twig", label: "Twig" },
    { id: "liquid", label: "Liquid" },
    { id: "markdown", label: "Markdown" },
    { id: "mdx", label: "MDX" },
    { id: "xml", label: "XML" },
    { id: "yaml", label: "YAML" },
    { id: "graphql", label: "GraphQL" },
    { id: "sql", label: "SQL" },
    { id: "mysql", label: "MySQL" },
    { id: "pgsql", label: "PostgreSQL" },
    { id: "python", label: "Python" },
    { id: "rust", label: "Rust" },
    { id: "go", label: "Go" },
    { id: "java", label: "Java" },
    { id: "csharp", label: "C#" },
    { id: "fsharp", label: "F#" },
    { id: "cpp", label: "C++" },
    { id: "c", label: "C" },
    { id: "objective-c", label: "Objective-C" },
    { id: "php", label: "PHP" },
    { id: "ruby", label: "Ruby" },
    { id: "swift", label: "Swift" },
    { id: "kotlin", label: "Kotlin" },
    { id: "dart", label: "Dart" },
    { id: "scala", label: "Scala" },
    { id: "clojure", label: "Clojure" },
    { id: "elixir", label: "Elixir" },
    { id: "lua", label: "Lua" },
    { id: "r", label: "R" },
    { id: "julia", label: "Julia" },
    { id: "perl", label: "Perl" },
    { id: "shell", label: "Shell Script" },
    { id: "powershell", label: "PowerShell" },
    { id: "bat", label: "Batch" },
    { id: "dockerfile", label: "Dockerfile" },
    { id: "hcl", label: "HCL / Terraform" },
    { id: "bicep", label: "Bicep" },
    { id: "ini", label: "Ini / TOML / Env" },
    { id: "protobuf", label: "Protocol Buffers" },
    { id: "solidity", label: "Solidity" },
    { id: "wgsl", label: "WGSL" },
    { id: "typespec", label: "TypeSpec" },
];

export function getLanguageLabel(id: string): string {
    return MONACO_LANGUAGE_OPTIONS.find((lang) => lang.id === id)?.label ?? id;
}
