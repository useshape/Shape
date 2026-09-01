import { describe, expect, it } from "vitest";
import { getLanguageId } from "@/features/editor/lib/languages";

describe("getLanguageId", () => {
    it("maps tsx to typescript", () => {
        expect(getLanguageId("C:/proj/src/App.tsx")).toBe("typescript");
    });

    it("maps vue to html", () => {
        expect(getLanguageId("C:/proj/App.vue")).toBe("html");
    });

    it("maps dockerfile by basename", () => {
        expect(getLanguageId("C:/proj/Dockerfile")).toBe("dockerfile");
    });

    it("maps package.json to json", () => {
        expect(getLanguageId("C:/proj/package.json")).toBe("json");
    });

    it("maps env files to ini", () => {
        expect(getLanguageId("C:/proj/.env.local")).toBe("ini");
    });

    it("maps rust and python", () => {
        expect(getLanguageId("C:/proj/src/main.rs")).toBe("rust");
        expect(getLanguageId("C:/proj/app.py")).toBe("python");
        expect(getLanguageId("C:/proj/main.go")).toBe("go");
    });

    it("maps css preprocessors and shell", () => {
        expect(getLanguageId("C:/proj/styles.scss")).toBe("scss");
        expect(getLanguageId("C:/proj/script.sh")).toBe("shell");
        expect(getLanguageId("C:/proj/run.ps1")).toBe("powershell");
    });

    it("maps additional languages", () => {
        expect(getLanguageId("C:/proj/schema.graphql")).toBe("graphql");
        expect(getLanguageId("C:/proj/main.kt")).toBe("kotlin");
        expect(getLanguageId("C:/proj/app.dart")).toBe("dart");
        expect(getLanguageId("C:/proj/main.swift")).toBe("swift");
        expect(getLanguageId("C:/proj/query.prisma")).toBe("graphql");
        expect(getLanguageId("C:/proj/infra.tf")).toBe("hcl");
        expect(getLanguageId("C:/proj/shader.wgsl")).toBe("wgsl");
        expect(getLanguageId("C:/proj/Main.scala")).toBe("scala");
        expect(getLanguageId("C:/proj/lib.ex")).toBe("elixir");
        expect(getLanguageId("C:/proj/Template.ftl")).toBe("freemarker2");
        expect(getLanguageId("C:/proj/boot.asm")).toBe("mips");
        expect(getLanguageId("C:/proj/Report.abap")).toBe("abap");
    });

    it("defaults unknown extensions to plaintext", () => {
        expect(getLanguageId("C:/proj/readme.xyz")).toBe("plaintext");
    });
});
