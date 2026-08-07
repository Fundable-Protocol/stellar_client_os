"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StreamProgressBarProps {
    startTime: number;
    endTime: number;
    totalAmount: string;
    withdrawnAmount: string;
    status: string;
    tokenSymbol: string;
}

const StreamProgressBar: React.FC<StreamProgressBarProps> = ({
    startTime,
    endTime,
    totalAmount,
    withdrawnAmount,
    status,
    tokenSymbol,
}) => {
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    useEffect(() => {
        if (status.toLowerCase() !== "active") return;

        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);

        return () => clearInterval(interval);
    }, [status]);

    const stats = useMemo(() => {
        const total = parseFloat(totalAmount);
        const withdrawnSize = parseFloat(withdrawnAmount);
        const now = currentTime;
        const start = startTime;
        const end = endTime;
        const duration = end - start;

        // Validate inputs up front
        const isValid =
            Number.isFinite(total) && total > 0 &&
            Number.isFinite(withdrawnSize) &&
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            Number.isFinite(duration) && duration > 0;

        if (!isValid) {
            return {
                withdrawnPercent: 0,
                vestedPercent: 0,
                remainingPercent: 0,
                withdrawnSize: 0,
                vestedSize: 0,
                vestedNotWithdrawnSize: 0,
                remainingSize: 0,
                total: 0,
            };
        }

        let vestedSize = 0;
        if (now > start) {
            const elapsed = Math.min(now - start, duration);
            vestedSize = (total * elapsed) / duration;
        }

        // Clamp values and ensuring non-negative/over-100%
        const currentVested = Math.min(total, Math.max(withdrawnSize, vestedSize));
        const withdrawnSizeClamped = Math.min(total, Math.max(0, withdrawnSize));

        // Calculate segments with clamping to [0, 100]
        const withdrawnPercent = Math.min(100, Math.max(0, (withdrawnSizeClamped / total) * 100));
        const vestedNotWithdrawnSize = Math.max(0, currentVested - withdrawnSizeClamped);
        const vestedPercent = Math.min(100 - withdrawnPercent, Math.max(0, (vestedNotWithdrawnSize / total) * 100));
        const remainingPercent = Math.min(100, Math.max(0, 100 - withdrawnPercent - vestedPercent));

        return {
            withdrawnPercent,
            vestedPercent,
            remainingPercent,
            withdrawnSize: withdrawnSizeClamped,
            vestedSize: currentVested,
            vestedNotWithdrawnSize,
            remainingSize: Math.max(0, total - currentVested),
            total,
        };
    }, [currentTime, startTime, endTime, totalAmount, withdrawnAmount]);

    return (
        <div className="w-full space-y-2">
            <TooltipProvider>
                <div className="h-2 w-full bg-zinc-700 rounded-full overflow-hidden flex">
                    {/* Withdrawn Segment */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Withdrawn ${stats.withdrawnSize.toFixed(4)} ${tokenSymbol}`}
                                className="h-full bg-blue-500 transition-all duration-1000 p-0 border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                style={{ width: `${stats.withdrawnPercent}%` }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Withdrawn: {stats.withdrawnSize.toFixed(4)} {tokenSymbol} ({stats.withdrawnPercent.toFixed(1)}%)</p>
                        </TooltipContent>
                    </Tooltip>

                    {/* Vested (Not Withdrawn) Segment */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Vested ${stats.vestedNotWithdrawnSize.toFixed(4)} ${tokenSymbol}`}
                                className="h-full bg-green-500 transition-all duration-1000 p-0 border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                                style={{ width: `${stats.vestedPercent}%` }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Vested: {stats.vestedNotWithdrawnSize.toFixed(4)} {tokenSymbol} ({stats.vestedPercent.toFixed(1)}%)</p>
                        </TooltipContent>
                    </Tooltip>

                    {/* Remaining Segment */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Remaining ${stats.remainingSize.toFixed(4)} ${tokenSymbol}`}
                                className="h-full bg-zinc-600 transition-all duration-1000 p-0 border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                                style={{ width: `${stats.remainingPercent}%` }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Remaining: {stats.remainingSize.toFixed(4)} {tokenSymbol} ({stats.remainingPercent.toFixed(1)}%)</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </TooltipProvider>

            <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                <span>{stats.withdrawnPercent.toFixed(1)}% withdrawn</span>
                <span>{Math.min(100, Math.max(0, (stats.vestedSize / stats.total) * 100)).toFixed(1)}% vested</span>
            </div>
        </div>
    );
};

export default StreamProgressBar;
