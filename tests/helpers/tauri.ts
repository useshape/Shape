import { mockIPC } from "@tauri-apps/api/mocks";
import type { MockIPCOptions } from "@tauri-apps/api/mocks";

export type InvokeHandler = Parameters<typeof mockIPC>[0];

export function mockInvoke(handler: InvokeHandler, options?: MockIPCOptions) {
    return mockIPC(handler, options);
}

export async function invokeMocked<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
}
