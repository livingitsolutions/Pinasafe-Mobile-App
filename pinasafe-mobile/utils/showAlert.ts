import { useState } from "react";

interface AlertOptions {
  title: string;
  message?: string;
  type?: "success" | "error" | "warning" | "info";
  confirmText?: string;
  onConfirm?: () => void;
}

let setGlobalAlert: ((options: AlertOptions & { visible: boolean }) => void) | null = null;

export const CustomAlertManager = {
  register: (setter: typeof setGlobalAlert) => {
    setGlobalAlert = setter;
  },
  show: (options: AlertOptions) => {
    setGlobalAlert?.({ ...options, visible: true });
  },
};
