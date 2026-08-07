export function useIsMobile() {
  return false;
}

export function useSidebar() {
  return {
    isMobile: false,
    state: 'expanded',
    open: true,
    setOpen: () => {},
    openMobile: false,
    setOpenMobile: () => {},
    toggleSidebar: () => {},
  };
}
