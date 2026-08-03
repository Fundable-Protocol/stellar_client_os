export interface UseMobileHookResult {
  isMobile: boolean;
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
}

export function useIsMobile(): boolean;
export function useSidebar(): UseMobileHookResult;
