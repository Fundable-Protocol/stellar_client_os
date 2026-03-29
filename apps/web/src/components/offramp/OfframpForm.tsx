"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import type { OfframpFormState, OfframpToken, OfframpCountry } from "@/types/offramp";
import { SUPPORTED_COUNTRIES, SUPPORTED_OFFRAMP_TOKENS } from "@/types/offramp";

interface OfframpFormProps {
    formState: OfframpFormState;
    onChange: (field: keyof OfframpFormState, value: string) => void;
    maxBalance?: string;
    onMaxClick?: () => void;
    isLoadingBalance?: boolean;
}

export function OfframpForm({ formState, onChange, maxBalance, onMaxClick, isLoadingBalance }: OfframpFormProps) {
    return (
        <div className="bg-fundable-mid-dark rounded-2xl p-6 border border-gray-800">
            <h2 className="text-xl font-syne font-semibold text-white mb-6">
                Crypto Token
            </h2>

            {/* Token Selector */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="token" className="text-fundable-light-grey text-sm">Select Token</Label>
                    <Select
                        value={formState.token}
                        onValueChange={(value) => onChange("token", value as OfframpToken)}
                    >
                        <SelectTrigger id="token" className="bg-fundable-dark border-gray-700 text-white h-12">
                            <SelectValue placeholder="Select token" />
                        </SelectTrigger>
                        <SelectContent className="bg-fundable-dark border-gray-700">
                            {SUPPORTED_OFFRAMP_TOKENS.map((token) => (
                                <SelectItem
                                    key={token.symbol}
                                    value={token.symbol}
                                    className="text-white hover:bg-fundable-violet focus:bg-fundable-violet"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{token.symbol}</span>
                                        <span className="text-fundable-light-grey text-sm">
                                            ({token.name})
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <Label htmlFor="amount" className="text-fundable-light-grey text-sm">Amount</Label>
                    <div className="relative">
                        <Input
                            id="amount"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={formState.amount}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, "");
                                if (val.split(".").length <= 2) onChange("amount", val);
                            }}
                            className="bg-fundable-dark border-gray-700 text-white h-12 pr-16"
                        />
                        <button
                            type="button"
                            onClick={onMaxClick}
                            disabled={!maxBalance || !onMaxClick || isLoadingBalance}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-fundable-purple text-sm font-medium hover:text-fundable-violet disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            {isLoadingBalance ? (
                                <>
                                    <div className="w-3 h-3 border border-fundable-purple border-t-transparent rounded-full animate-spin" />
                                    <span>Loading...</span>
                                </>
                            ) : (
                                "Max"
                            )}
                        </button>
                    </div>
                </div>

                {/* Destination Country */}
                <div className="space-y-2">
                    <Label htmlFor="country" className="text-fundable-light-grey text-sm">
                        Destination Country
                    </Label>
                    <Select
                        value={formState.country}
                        onValueChange={(value) => onChange("country", value as OfframpCountry)}
                    >
                        <SelectTrigger id="country" className="bg-fundable-dark border-gray-700 text-white h-12">
                            <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent className="bg-fundable-dark border-gray-700">
                            {SUPPORTED_COUNTRIES.map((country) => (
                                <SelectItem
                                    key={country.code}
                                    value={country.code}
                                    className="text-white hover:bg-fundable-violet focus:bg-fundable-violet"
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{country.flag}</span>
                                        <span>{country.name}</span>
                                        <span className="text-fundable-light-grey">
                                            ({country.currency})
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
