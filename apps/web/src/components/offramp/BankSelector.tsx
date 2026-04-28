"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Bank, OfframpCountry } from "@/types/offramp";
import { getAccountNumberRules } from "@/types/offramp";
import { offrampService } from "@/services/offramp.service";
import { notify } from "@/utils/notification";

interface BankSelectorProps {
    country: OfframpCountry;
    selectedBankCode: string;
    accountNumber: string;
    accountName: string;
    walletAddress: string | null;
    onBankChange: (bankCode: string, bankName: string) => void;
    onAccountNumberChange: (accountNumber: string) => void;
    onAccountVerified: (accountName: string) => void;
}

export function BankSelector({
    country,
    selectedBankCode,
    accountNumber,
    accountName,
    walletAddress,
    onBankChange,
    onAccountNumberChange,
    onAccountVerified,
}: BankSelectorProps) {
    const [banks, setBanks] = useState<Bank[]>([]);
    const [isLoadingBanks, setIsLoadingBanks] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const { min: minLen, max: maxLen } = getAccountNumberRules(country);

    // Load banks when country changes
    useEffect(() => {
        const loadBanks = async () => {
            setIsLoadingBanks(true);
            try {
                const res = await offrampService.getBankList(country, walletAddress || undefined);
                if (res.success && res.data) {
                    setBanks(res.data);
                }
            } catch (e) {
                notify.error("Failed to load banks. Please try again later.");
            } finally {
                setIsLoadingBanks(false);
            }
        };
        loadBanks();
    }, [country, walletAddress]);

    // Auto-verify account when both bank and account number are valid
    const verifyAccount = useCallback(async () => {
        if (!selectedBankCode || accountNumber.length < minLen) return;

        setIsVerifying(true);
        setVerifyError(null);

        try {
            const res = await offrampService.verifyBankAccount(
                selectedBankCode,
                accountNumber,
                country,
                walletAddress || undefined
            );

            if (res.success && res.data) {
                onAccountVerified(res.data.accountName);
            } else {
                setVerifyError(res.error || "Could not verify account");
                onAccountVerified("");
            }
        } catch {
            setVerifyError("Verification failed. Please check details.");
            onAccountVerified("");
        } finally {
            setIsVerifying(false);
        }
    }, [selectedBankCode, accountNumber, country, walletAddress, onAccountVerified, minLen]);

    useEffect(() => {
        if (selectedBankCode && accountNumber.length >= minLen) {
            const timer = setTimeout(verifyAccount, 500);
            return () => clearTimeout(timer);
        }
    }, [selectedBankCode, accountNumber, verifyAccount]);

    const filteredBanks = banks.filter((bank) =>
        bank.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* Bank Selection */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Select Bank
                </label>
                {isLoadingBanks ? (
                    <div className="w-full h-12 rounded-xl bg-white/5 animate-pulse" />
                ) : (
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search for your bank..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-fundable-purple-2 transition-colors"
                        />
                        {searchTerm && filteredBanks.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl bg-[#1a1a2e] border border-white/10 shadow-xl">
                                {filteredBanks.map((bank) => (
                                    <button
                                        key={bank.code}
                                        type="button"
                                        onClick={() => {
                                            onBankChange(bank.code, bank.name);
                                            setSearchTerm(bank.name);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition-colors ${selectedBankCode === bank.code
                                                ? "text-fundable-purple-2 bg-white/5"
                                                : "text-white"
                                            }`}
                                    >
                                        {bank.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {selectedBankCode && !searchTerm && (
                    <p className="mt-1 text-xs text-gray-400">
                        Selected: {banks.find((b) => b.code === selectedBankCode)?.name}
                    </p>
                )}
            </div>

            {/* Account Number */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Account Number
                </label>
                <input
                    type="text"
                    inputMode="numeric"
                    maxLength={maxLen}
                    placeholder={`Enter ${minLen === maxLen ? `${minLen}-digit` : `${minLen}-${maxLen} digit`} account number`}
                    value={accountNumber}
                    onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        onAccountNumberChange(val);
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-fundable-purple-2 transition-colors"
                />
            </div>

            {/* Verification Status */}
            {isVerifying && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-fundable-purple-2 border-t-transparent rounded-full animate-spin" />
                    Verifying account...
                </div>
            )}

            {verifyError && (
                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {verifyError}
                </div>
            )}

            {accountName && !isVerifying && (
                <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    <span className="font-medium">Account Name:</span> {accountName}
                </div>
            )}
        </div>
    );
}
