import { commands } from "@/lib/backend/commands";

let cachedDeviceId: string | null = null;

export async function getShapeDeviceId(): Promise<string | null> {
    if (cachedDeviceId) return cachedDeviceId;
    try {
        cachedDeviceId = await commands.getDeviceId();
        return cachedDeviceId;
    } catch {
        return null;
    }
}
