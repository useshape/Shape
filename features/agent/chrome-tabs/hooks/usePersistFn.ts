import { useCallback } from "react";
import { useLatest } from "./useLatest";

export function usePersistFn<T extends (...args: any[]) => any>(fn: T) {
  const latest = useLatest(fn);
  return useCallback((...args: Parameters<T>) => {
    return latest.current(...args);
  }, []) as T;
}
