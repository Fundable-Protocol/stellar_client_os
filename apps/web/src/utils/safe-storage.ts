/**
 * Safe LocalStorage Wrapper
 * 
 * Protects against QuotaExceededError or SecurityError when accessing localStorage
 * in private/incognito browsing modes or when storage is full.
 */

export const safeGetItem = (key: string): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch (error) {
    console.warn(`[SafeStorage] Failed to get item '${key}':`, error);
    return null;
  }
};

export const safeSetItem = (key: string, value: string): boolean => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`[SafeStorage] Failed to set item '${key}':`, error);
    return false;
  }
};

export const safeRemoveItem = (key: string): boolean => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`[SafeStorage] Failed to remove item '${key}':`, error);
    return false;
  }
};

export const isStorageAvailable = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};
