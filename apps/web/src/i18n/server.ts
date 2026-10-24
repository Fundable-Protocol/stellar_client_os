import { cookies, headers } from "next/headers";
import { UI_LOCALE_COOKIE, resolveUiLocale, uiLocaleFromAcceptLanguage, type UiLocale } from "./config";

/**
 * Resolve the UI locale for a server render: explicit cookie choice first,
 * then the browser's Accept-Language header.
 */
export async function getRequestUiLocale(): Promise<UiLocale> {
  const cookieValue = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  if (cookieValue) return resolveUiLocale(cookieValue);
  return uiLocaleFromAcceptLanguage((await headers()).get("accept-language"));
}
