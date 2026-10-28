import { useEffect, useRef } from 'react';

export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  }, [state]);

  return ref.current;
}