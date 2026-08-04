import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("offrampService.getProviderLimits", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv("NEXT_PUBLIC_BACKEND_BASE_URL", "https://api.example.com");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("fetches provider limits for the selected corridor", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    data: {
                        minimumAmount: 25,
                        providers: [
                            { providerId: "cashwyre", minimumAmount: 25 },
                        ],
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            )
        );
        vi.stubGlobal("fetch", fetchMock);
        const { offrampService } = await import("./offramp.service");

        const result = await offrampService.getProviderLimits({
            token: "USDC",
            country: "NG",
            network: "polygon",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.example.com/api/offramp/limits?token=USDC&country=NG&network=polygon",
            expect.objectContaining({ method: "GET" })
        );
        expect(result).toEqual({
            success: true,
            data: {
                minimumAmount: 25,
                providers: [
                    { providerId: "cashwyre", minimumAmount: 25 },
                ],
            },
        });
    });

    it("rejects malformed minimum values instead of trusting them", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ data: { minimumAmount: "25" } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            )
        );
        const { offrampService } = await import("./offramp.service");

        const result = await offrampService.getProviderLimits({
            token: "USDC",
            country: "NG",
            network: "polygon",
        });

        expect(result).toEqual({
            success: false,
            error: "Provider limits response did not include a valid minimum amount",
        });
    });

    it("derives the usable minimum from provider-specific limits", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        data: {
                            providers: [
                                { providerId: "cashwyre", minimumAmount: 10 },
                                { providerId: "autoramp", minimumAmount: 5 },
                            ],
                        },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }
                )
            )
        );
        const { offrampService } = await import("./offramp.service");

        const result = await offrampService.getProviderLimits({
            token: "USDC",
            country: "GH",
            network: "polygon",
        });

        expect(result.data?.minimumAmount).toBe(5);
    });
});
