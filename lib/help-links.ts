import { SHAPE_API_BASE } from "@/lib/shape-auth/api";

export const HELP_LINKS = {
    documentation: `${SHAPE_API_BASE}/docs/introduction/quick-start`,
    changelog: `${SHAPE_API_BASE}/docs/changelog`,
    reportIssue: "https://github.com/useshape/Shape/issues/new",
    license: `${SHAPE_API_BASE}/terms`,
    privacy: `${SHAPE_API_BASE}/privacy`,
    download: `${SHAPE_API_BASE}/download`,
} as const;
