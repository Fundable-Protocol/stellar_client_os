declare namespace React {
  type ComponentProps<T extends keyof JSX.IntrinsicElements | JSXElementConstructor<any>> = any;
  type CSSProperties = Record<string, string | number | undefined>;
  type Dispatch<A> = (value: A) => void;

  function createContext<T>(defaultValue: T): any;
  function useContext<T>(context: any): T;
  function useState<T>(initialState: T | (() => T)): [T, Dispatch<T | ((prev: T) => T)>];
  function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  function useId(): string;
  function useSyncExternalStore<T>(
    subscribe: (callback: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T
  ): T;
}

declare module '@/hooks/use-mobile' {
  export function useIsMobile(): boolean;
}

declare module '@/components/ui/sidebar' {
  export interface SidebarContextValue {
    isMobile: boolean;
    state: 'expanded' | 'collapsed';
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    toggleSidebar: () => void;
  }

  export function useSidebar(): SidebarContextValue;
}
