"use client";
import { useEffect } from "react";
import { Toaster, useToasterStore, toast } from "react-hot-toast";

const TOAST_LIMIT = 3;

export const ToastProvider = () => {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= TOAST_LIMIT)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  return (
    <Toaster
      position="top-right"
      gutter={12}
      toastOptions={{
        className: "",
        style: {
          background: "#1a1b1e",
          color: "#fff",
          border: "1px solid #7c3aed",
          padding: "16px",
        },
        success: {
          iconTheme: {
            primary: "#7c3aed",
            secondary: "#fff",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#fff",
          },
        },
      }}
    />
  );
};
