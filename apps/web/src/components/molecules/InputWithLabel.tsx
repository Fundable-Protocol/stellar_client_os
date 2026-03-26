"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface InputWithLabelProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    title?: string;
    errorMessage?: string;
}

const InputWithLabel = ({
    title,
    className,
    id,
    errorMessage,
    ...props
}: InputWithLabelProps) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = errorMessage ? `${inputId}-error` : undefined;

    return (
        <div className="flex flex-col w-full">
            {title && (
                <label htmlFor={inputId} className="text-zinc-300 mb-3 text-nowrap">
                    {title}
                </label>
            )}

            <Input
                id={inputId}
                aria-describedby={errorId}
                aria-invalid={!!errorMessage}
                className={cn(
                    "border-zinc-700 bg-zinc-800 rounded h-12 placeholder:text-zinc-500 text-white",
                    className
                )}
                {...props}
            />

            {errorMessage && (
                <p id={errorId} role="alert" className="mt-1 text-sm text-red-400">
                    {errorMessage}
                </p>
            )}
        </div>
    );
};

export default InputWithLabel;
