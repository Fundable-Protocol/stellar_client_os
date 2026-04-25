"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ChevronDown, Search } from "lucide-react";

import type { OfframpFormState, Bank } from "@/types/offramp";
import { getAccountNumberRules } from "@/types/offramp";

interface BankDetailsCardProps {
    formState: OfframpFormState;
    banks: Bank[];
    isLoadingBanks: boolean;
    isVerifyingAccount: boolean;
    onChange: (field: keyof OfframpFormState, value: string) => void;
}

function BankCombobox({
    banks,
    value,
    onChange,
    isLoading,
}: {
    banks: Bank[];
    value: string;
    onChange: (code: string) => void;
    isLoading: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedBank = banks.find((b) => b.code === value);

    const filtered = useMemo(
        () =>
            search
                ? banks.filter((b) =>
                    b.name.toLowerCase().includes(search.toLowerCase())
                )
                : banks,
        [banks, search]
    );

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleSelect = (code: string) => {
        onChange(code);
        setIsOpen(false);
        setSearch("");
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger / Search Input */}
            <button
                type="button"
                onClick={() => {
                    setIsOpen((prev) => !prev);
                    if (!isOpen) {
                        setTimeout(() => inputRef.current?.focus(), 50);
                    }
                }}
                disabled={isLoading}
                className="flex items-center justify-between w-full h-12 px-3 rounded-md border border-gray-700 bg-fundable-dark text-white text-sm transition-colors hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-fundable-purple focus:ring-offset-1 focus:ring-offset-fundable-dark disabled:opacity-50"
            >
                {isLoading ? (
                    <span className="flex items-center gap-2 text-fundable-light-grey">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading banks...
                    </span>
                ) : selectedBank ? (
                    <span className="truncate">{selectedBank.name}</span>
                ) : (
                    <span className="text-fundable-light-grey">Select bank</span>
                )}
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-fundable-light-grey transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-700 bg-fundable-dark shadow-xl animate-in fade-in-0 zoom-in-95">
                    {/* Search field */}
                    <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
                        <Search className="h-4 w-4 text-fundable-light-grey shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Type to search..."
                            className="w-full bg-transparent text-sm text-white placeholder:text-fundable-light-grey outline-none"
                        />
                    </div>

                    {/* Options list */}
                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-6 text-center text-sm text-fundable-light-grey">
                                No banks found
                            </div>
                        ) : (
                            filtered.map((bank) => (
                                <button
                                    key={bank.code}
                                    type="button"
                                    onClick={() => handleSelect(bank.code)}
                                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${bank.code === value
                                            ? "bg-fundable-violet text-white"
                                            : "text-white hover:bg-fundable-violet/50"
                                        }`}
                                >
                                    {bank.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BankDetailsCard({
    formState,
    banks,
    isLoadingBanks,
    isVerifyingAccount,
    onChange,
}: BankDetailsCardProps) {
    const { max: maxLen } = getAccountNumberRules(formState.country);
    return (
        <div className="bg-fundable-mid-dark rounded-2xl p-6 border border-gray-800">
            <h2 className="text-xl font-syne font-semibold text-white mb-6">
                Bank Details
            </h2>

            <div className="space-y-4">
                {/* Searchable Bank Selector */}
                <div className="space-y-2">
                    <Label className="text-fundable-light-grey text-sm">Bank Name</Label>
                    <BankCombobox
                        banks={banks}
                        value={formState.bankCode}
                        onChange={(code) => onChange("bankCode", code)}
                        isLoading={isLoadingBanks}
                    />
                </div>

                {/* Account Number */}
                <div className="space-y-2">
                    <Label className="text-fundable-light-grey text-sm">
                        Account Number
                    </Label>
                    <div className="relative">
                        <Input
                            type="text"
                            placeholder="Enter account number"
                            value={formState.accountNumber}
                            onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "").slice(0, maxLen);
                                onChange("accountNumber", value);
                            }}
                            className="bg-fundable-dark border-gray-700 text-white h-12"
                            maxLength={maxLen}
                        />
                        {isVerifyingAccount && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-fundable-purple" />
                        )}
                    </div>
                </div>

                {/* Account Name (auto-filled) */}
                <div className="space-y-2">
                    <Label className="text-fundable-light-grey text-sm">
                        Account Name
                    </Label>
                    <div className="relative">
                        <Input
                            type="text"
                            placeholder="Account name will appear here"
                            value={formState.accountName}
                            readOnly
                            className="bg-fundable-dark border-gray-700 text-white h-12 pr-10"
                        />
                        {formState.accountName && (
                            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                        )}
                    </div>
                    {formState.accountName && (
                        <p className="text-green-500 text-xs">Account verified ✓</p>
                    )}
                </div>
            </div>
        </div>
    );
}

