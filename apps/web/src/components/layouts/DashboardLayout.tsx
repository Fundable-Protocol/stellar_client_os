"use client";

import { cn } from "@/lib/utils";
import { ReactNode, useEffect, useState } from "react";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

const ComingSoon = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <h2 className="text-2xl font-medium mb-2">Coming Soon!</h2>
            <p className="text-gray-400 text-center">
                This feature is currently under development. Please check back later. 😎
            </p>
        </div>
    );
};

const useHighContrast = () => {
    const [highContrast, setHighContrast] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("highContrast");
        if (stored === "true") setHighContrast(true);

        const handleChange = (e: Event) => {
            const detail = (e as CustomEvent<boolean>).detail;
            setHighContrast(detail);
        };
        window.addEventListener("highContrastChange", handleChange);
        return () =>
            window.removeEventListener("highContrastChange", handleChange);
    }, []);

    return highContrast;
};

export interface InfoMessage {
    type: "info" | "warning" | "error";
    title?: string;
    message: string;
    showOnNetwork?: "mainnet" | "testnet" | "both";
}

const InlineInfoMessage = ({
    infoMessage,
    currentNetwork,
    highContrast,
}: {
    infoMessage: InfoMessage;
    currentNetwork: string;
    highContrast: boolean;
}) => {
    if (infoMessage.showOnNetwork && infoMessage.showOnNetwork !== "both") {
        if (infoMessage.showOnNetwork !== currentNetwork) return null;
    }

    const getIconAndStyles = () => {
        switch (infoMessage.type) {
            case "warning":
                return {
                    icon: <AlertTriangle className={highContrast ? "w-5 h-5" : "w-4 h-4"} />,
                    textColor: highContrast ? "text-yellow-200" : "text-yellow-400",
                    iconColor: highContrast ? "text-yellow-300" : "text-yellow-500",
                };
            case "error":
                return {
                    icon: <AlertCircle className={highContrast ? "w-5 h-5" : "w-4 h-4"} />,
                    textColor: highContrast ? "text-red-200" : "text-red-400",
                    iconColor: highContrast ? "text-red-300" : "text-red-500",
                };
            case "info":
            default:
                return {
                    icon: <Info className={highContrast ? "w-5 h-5" : "w-4 h-4"} />,
                    textColor: highContrast ? "text-blue-200" : "text-blue-400",
                    iconColor: highContrast ? "text-blue-300" : "text-blue-500",
                };
        }
    };

    const styles = getIconAndStyles();

    return (
        <div className="flex items-center gap-2 ml-auto md:ml-auto">
            <div className={styles.iconColor}>{styles.icon}</div>
            <span className={cn(highContrast ? "text-base font-medium" : "text-sm", styles.textColor)}>
                {infoMessage.title && (
                    <span className="font-semibold">{infoMessage.title}: </span>
                )}
                {infoMessage.message}
            </span>
        </div>
    );
};

const DashboardLayout = ({
    title,
    children,
    className,
    availableNetwork = ["testnet", "mainnet"],
    infoMessage,
}: {
    title: string;
    children?: ReactNode;
    className?: string;
    availableNetwork?: string[];
    infoMessage?: InfoMessage;
}) => {
    // For Stellar, we'll use testnet as default - can be enhanced with wallet provider context
    const currentNetwork = "testnet";
    const isAvailableOnCurrentNetwork = availableNetwork.includes(currentNetwork);
    const highContrast = useHighContrast();

    return (
        <div
            className={cn(
                "flex flex-col text-white p-4 md:pt-6 md:pb-0 rounded-2xl min-h-full",
                highContrast
                    ? "bg-black text-lg border-2 border-white"
                    : "bg-zinc-900 text-base"
            )}
        >
            <div className="border-b border-b-zinc-700 pb-4 w-full flex-none">
                {/* Desktop: Title and info message on same line */}
                <div className="hidden md:flex items-center">
                    <h1 className={cn("font-medium", highContrast ? "text-2xl font-bold" : "text-xl")}>{title}</h1>
                    {infoMessage && isAvailableOnCurrentNetwork && (
                        <InlineInfoMessage
                            infoMessage={infoMessage}
                            currentNetwork={currentNetwork}
                            highContrast={highContrast}
                        />
                    )}
                </div>

                {/* Mobile: Title and info message stacked */}
                <div className="md:hidden">
                    <h1 className={cn("font-medium", highContrast ? "text-2xl font-bold" : "text-xl")}>{title}</h1>
                    {infoMessage && isAvailableOnCurrentNetwork && (
                        <div className="mt-2">
                            <InlineInfoMessage
                                infoMessage={infoMessage}
                                currentNetwork={currentNetwork}
                                highContrast={highContrast}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div
                className={cn(
                    "flex-1 my-4 px-2",
                    highContrast && "focus-within:outline focus-within:outline-2 focus-within:outline-yellow-300",
                    className
                )}
            >
                {!availableNetwork.length ? (
                    <ComingSoon />
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

export default DashboardLayout;
