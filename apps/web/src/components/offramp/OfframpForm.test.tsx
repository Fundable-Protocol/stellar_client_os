import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OfframpForm } from "./OfframpForm";

const formState = {
    token: "USDC" as const,
    amount: "",
    country: "NG" as const,
    bankCode: "",
    accountNumber: "",
    accountName: "",
};

describe("OfframpForm", () => {
    it("shows the minimum supplied by the provider limits service", () => {
        render(
            <OfframpForm
                formState={formState}
                onChange={vi.fn()}
                minimumAmount={25}
            />
        );

        expect(screen.getByText(/Minimum: 25 USDC/)).toBeTruthy();
    });

    it("shows a loading state while provider limits are being fetched", () => {
        render(
            <OfframpForm
                formState={formState}
                onChange={vi.fn()}
                minimumAmount={1}
                isLoadingMinimum
            />
        );

        expect(screen.getByText(/Loading provider minimum/)).toBeTruthy();
    });
});
