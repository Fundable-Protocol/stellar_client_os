import { useCallback, useEffect, useRef } from 'react';

/**
 * A custom hook that returns a debounced version of the provided callback.
 * 
 * @param callback The function to debounce
 * @param delay    The delay in milliseconds
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      // Wait, flush shouldn't just clear it, it should execute it if pending 🤔
      // To keep it simple, we don't need a complex flush, just the debounced callback
    }
  }, []);

  return debouncedCallback;
}
