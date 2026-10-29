import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { I18nProvider, useTranslation } from "./I18nProvider";
import { UI_LOCALE_COOKIE } from "./config";

function LocaleProbe() {
  const { locale, dir, setLocale, t } = useTranslation();

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="home">{t("nav.home")}</span>
      <span data-testid="pledge-back">{t("pledge.backToCampaign")}</span>
      <button type="button" onClick={() => setLocale("he")}>
        Hebrew
      </button>
      <button type="button" onClick={() => setLocale("ar")}>
        Arabic
      </button>
    </div>
  );
}

describe("I18nProvider RTL document direction", () => {
  beforeEach(() => {
    document.documentElement.lang = "";
    document.documentElement.dir = "";
  });

  it("applies lang and dir to the document root for the initial locale", () => {
    render(
      <I18nProvider initialLocale="he">
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByTestId("dir").textContent).toBe("rtl");
  });

  it("switches from LTR to RTL when Hebrew is selected and persists the cookie", () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getByTestId("home").textContent).toBe("Home");

    fireEvent.click(screen.getByRole("button", { name: "Hebrew" }));

    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.dir).toBe(screen.getByTestId("dir").textContent);
    expect(screen.getByTestId("home").textContent).toBe("בית");
    expect(screen.getByTestId("pledge-back").textContent).toBe("חזרה לקמפיין");
    expect(document.cookie).toContain(`${UI_LOCALE_COOKIE}=he`);
  });

  it("keeps Arabic right-to-left", () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleProbe />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Arabic" }));

    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
});
