import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FaqPage } from "./FaqPage";
import { FAQ_ITEMS } from "./faqData";

describe("FaqPage", () => {
  it("renders every FAQ question by default", () => {
    render(<FaqPage />);

    for (const item of FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeTruthy();
    }
  });

  it("filters questions by search query", () => {
    render(<FaqPage />);

    const search = screen.getByLabelText("Search frequently asked questions");
    fireEvent.change(search, { target: { value: "anonymously" } });

    expect(screen.getByText("Can I donate anonymously?")).toBeTruthy();
    expect(screen.queryByText("How do I withdraw earnings?")).toBeNull();
  });

  it("shows a no-results message when nothing matches", () => {
    render(<FaqPage />);

    const search = screen.getByLabelText("Search frequently asked questions");
    fireEvent.change(search, { target: { value: "zzz-not-a-real-topic" } });

    expect(screen.getByText(/No questions match/i)).toBeTruthy();
  });

  it("filters questions by category", () => {
    render(<FaqPage />);

    fireEvent.click(screen.getByText("For Planters"));

    expect(screen.getByText("How do I withdraw earnings?")).toBeTruthy();
    expect(screen.queryByText("Can I cancel a sponsorship or stream I've funded?")).toBeNull();
  });

  it("expands an answer on click and collapses it on a second click", () => {
    render(<FaqPage />);

    const question = screen.getByText("How does verification work?");
    expect(screen.queryByText(/Eligible donors and planters/)).toBeNull();

    fireEvent.click(question);
    expect(screen.getByText(/Eligible donors and planters/)).toBeTruthy();

    fireEvent.click(question);
    expect(screen.queryByText(/Eligible donors and planters/)).toBeNull();
  });
});
