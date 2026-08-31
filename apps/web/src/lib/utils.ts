import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clxx(inputs));
}

/**
 * Capitalize the first letter of a word
 */
export function capitalizeWord(str: string): string {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Slice a Stellar address for display (e.g., GCKF...2BVN7)
 */
export function sliceAddress(address: string, startChars = 4, endChars = 5): string {
    if (!address) return "";
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Sort an array of items by a given property.
 * Defaults to ascending order (soonest deadlines, lowest altitudes).
 * Pass `descending = true` for descending order (e.g. highest pay).
 */
export function sortByProperty<T>(items: T[], key: keyof T, descending = false): T[] {
    return [...items].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return descending ? 1 : -1;
        if (aVal > bVal) return descending ? -1 : 1;
        return 0;
    });
}