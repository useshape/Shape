import { getIconPathForType } from "./files";

const SYMBOL_ICON_MAP: Record<string, string> = {
    File: "text",
    Module: "module",
    Namespace: "module",
    Package: "npm",
    Class: "anyType",
    Method: "javaScript",
    Property: "config",
    Field: "json",
    Constructor: "anyType",
    Enum: "config",
    Interface: "typeScript",
    Function: "javaScript",
    Variable: "javaScript",
    Constant: "lock",
    String: "text",
    Number: "text",
    Boolean: "text",
    Array: "json",
    Object: "json",
    Key: "config",
    Null: "text",
    EnumMember: "config",
    Struct: "anyType",
    Event: "module",
    Operator: "text",
    TypeParameter: "typeScript",
    Type: "typeScript",
    Heading: "markdown",
    Selector: "css",
};

export function getSymbolIconPath(kind: string): string {
    return getIconPathForType(SYMBOL_ICON_MAP[kind] || "text");
}
