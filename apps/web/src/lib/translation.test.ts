import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  hasOnlySupportedTranslationLocales,
  SUPPORTED_TRANSLATION_LOCALES,
} from "./translation";

describe("campaign translation support", () => {
  it("supports more than twenty campaign locales", () => {
    expect(SUPPORTED_TRANSLATION_LOCALES.length).toBeGreaterThanOrEqual(20);
    expect(SUPPORTED_TRANSLATION_LOCALES).toContain("ar");
    expect(SUPPORTED_TRANSLATION_LOCALES).toContain("zh");
  });

  it("detects Arabic campaign text", () => {
    expect(detectLanguage("حماية غابات الأمازون")).toBe("ar");
  });

  it("accepts supplied translations only for supported locales", () => {
    expect(hasOnlySupportedTranslationLocales({ ar: "عنوان الحملة", es: "Título" })).toBe(true);
    expect(hasOnlySupportedTranslationLocales({ xx: "Campaign title" })).toBe(false);
  });
});
