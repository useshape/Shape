import { ShapeApiError, shapeApiFetch } from "@/lib/shape-auth/api";
import { getShapeAccessToken } from "@/lib/shape-auth/store";

export type PluginRow = {
    id: string;
    name: string;
    description: string;
    category: string;
    toolkit: string;
    connected: boolean;
};

export type PluginToolHint = {
    slug: string;
    name: string;
    description: string;
};

function tokenOrThrow(): string {
    const token = getShapeAccessToken();
    if (!token) throw new ShapeApiError("Sign in to Shape to use plugins.", 401);
    return token;
}

export async function fetchPlugins(): Promise<{ plugins: PluginRow[]; configured: boolean }> {
    return shapeApiFetch("/plugins", { token: tokenOrThrow() });
}

export async function startPluginConnect(toolkit: string): Promise<{ redirectUrl: string }> {
    return shapeApiFetch("/plugins/connect", {
        method: "POST",
        token: tokenOrThrow(),
        body: JSON.stringify({ toolkit }),
    });
}

export async function disconnectPlugin(toolkit: string): Promise<void> {
    await shapeApiFetch("/plugins/disconnect", {
        method: "POST",
        token: tokenOrThrow(),
        body: JSON.stringify({ toolkit }),
    });
}
