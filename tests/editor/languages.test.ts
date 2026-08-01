import { describe, expect, it } from "vitest";
import {
    filterLspServersBySettings,
    getLspServersForProject,
    getMonacoLanguage,
} from "@/features/editor/lsp/languages";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { withSettings } from "../helpers/settings";

describe("getMonacoLanguage", () => {
    it("maps tsx to typescript", () => {
        expect(getMonacoLanguage("C:/proj/src/App.tsx")).toBe("typescript");
    });

    it("maps vue to html", () => {
        expect(getMonacoLanguage("C:/proj/App.vue")).toBe("html");
    });

    it("maps dockerfile by basename", () => {
        expect(getMonacoLanguage("C:/proj/Dockerfile")).toBe("dockerfile");
    });

    it("maps package.json to json", () => {
        expect(getMonacoLanguage("C:/proj/package.json")).toBe("json");
    });

    it("maps env files to ini", () => {
        expect(getMonacoLanguage("C:/proj/.env.local")).toBe("ini");
    });

    it("maps rust and python", () => {
        expect(getMonacoLanguage("C:/proj/src/main.rs")).toBe("rust");
        expect(getMonacoLanguage("C:/proj/app.py")).toBe("python");
        expect(getMonacoLanguage("C:/proj/main.go")).toBe("go");
    });

    it("maps css preprocessors and shell", () => {
        expect(getMonacoLanguage("C:/proj/styles.scss")).toBe("scss");
        expect(getMonacoLanguage("C:/proj/script.sh")).toBe("shell");
        expect(getMonacoLanguage("C:/proj/run.ps1")).toBe("powershell");
    });

    it("maps additional Monaco Monarch languages", () => {
        expect(getMonacoLanguage("C:/proj/schema.graphql")).toBe("graphql");
        expect(getMonacoLanguage("C:/proj/main.kt")).toBe("kotlin");
        expect(getMonacoLanguage("C:/proj/app.dart")).toBe("dart");
        expect(getMonacoLanguage("C:/proj/main.swift")).toBe("swift");
        expect(getMonacoLanguage("C:/proj/query.prisma")).toBe("graphql");
        expect(getMonacoLanguage("C:/proj/infra.tf")).toBe("hcl");
        expect(getMonacoLanguage("C:/proj/shader.wgsl")).toBe("wgsl");
        expect(getMonacoLanguage("C:/proj/Main.scala")).toBe("scala");
        expect(getMonacoLanguage("C:/proj/lib.ex")).toBe("elixir");
        expect(getMonacoLanguage("C:/proj/Template.ftl")).toBe("freemarker2");
        expect(getMonacoLanguage("C:/proj/boot.asm")).toBe("mips");
        expect(getMonacoLanguage("C:/proj/Report.abap")).toBe("abap");
    });

    it("defaults unknown extensions to plaintext", () => {
        expect(getMonacoLanguage("C:/proj/readme.xyz")).toBe("plaintext");
    });
});

describe("getLspServersForProject", () => {
    it("always includes typescript server", () => {
        const servers = getLspServersForProject({
            hasReact: false,
            hasVue: false,
            hasAngular: false,
            hasSvelte: false,
            hasNextjs: false,
            hasTailwind: false,
            hasTypescript: false,
        });
        expect(servers.some((s) => s.language === "typescript")).toBe(true);
    });

    it("adds tailwind server when enabled", () => {
        const servers = getLspServersForProject({
            hasReact: false,
            hasVue: false,
            hasAngular: false,
            hasSvelte: false,
            hasNextjs: false,
            hasTailwind: true,
            hasTypescript: false,
        });
        expect(servers.some((s) => s.language === "tailwindcss")).toBe(true);
    });

    it("adds vue server for vue projects", () => {
        const servers = getLspServersForProject({
            hasReact: false,
            hasVue: true,
            hasAngular: false,
            hasSvelte: false,
            hasNextjs: false,
            hasTailwind: false,
            hasTypescript: false,
        });
        expect(servers.some((s) => s.language === "vue")).toBe(true);
    });
});

describe("filterLspServersBySettings", () => {
    it("filters disabled typescript", () => {
        withSettings({ lsp: { ...DEFAULT_SETTINGS.lsp, typescript: false } });
        const servers = getLspServersForProject({
            hasReact: false,
            hasVue: false,
            hasAngular: false,
            hasSvelte: false,
            hasNextjs: false,
            hasTailwind: false,
            hasTypescript: true,
        });
        const filtered = filterLspServersBySettings(servers);
        expect(filtered.some((s) => s.language === "typescript")).toBe(false);
    });
});
