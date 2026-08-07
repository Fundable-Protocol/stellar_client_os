'use client';

import { useEffect } from 'react';

const DEFAULT_WARNING_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?';

/**
 * Warn users before they navigate away from a dirty form.
 */
export function useUnsavedChanges(isDirty: boolean, message: string = DEFAULT_WARNING_MESSAGE) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isDirty) {
      document.body.dataset.formDirty = 'true';
    } else {
      delete document.body.dataset.formDirty;
    }

    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirty) return;

      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;

      if (!anchor) {
        return;
      }

      if (
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const isSamePage =
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search &&
        nextUrl.hash === window.location.hash;

      if (isSamePage) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePopState = () => {
      if (!isDirty) return;
      if (!window.confirm(message)) {
        window.history.go(1);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty, message]);
}

