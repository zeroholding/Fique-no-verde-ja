"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import clsx from "clsx";

const CloseIcon = ({ className }: { className: string }) => (
  <svg height="16" strokeLinejoin="round" viewBox="0 0 16 16" width="16" className={className}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.4697 13.5303L13 14.0607L14.0607 13L13.5303 12.4697L9.06065 7.99999L13.5303 3.53032L14.0607 2.99999L13 1.93933L12.4697 2.46966L7.99999 6.93933L3.53032 2.46966L2.99999 1.93933L1.93933 2.99999L2.46966 3.53032L6.93933 7.99999L2.46966 12.4697L1.93933 13L2.99999 14.0607L3.53032 13.5303L7.99999 9.06065L12.4697 13.5303Z"
    />
  </svg>
);

type Toast = {
  id: number;
  text: string | ReactNode;
  measuredHeight?: number;
  timeout?: NodeJS.Timeout;
  remaining?: number;
  start?: number;
  pause?: () => void;
  resume?: () => void;
  type: "success" | "warning" | "error";
};

let root: ReturnType<typeof createRoot> | null = null;
let toastId = 0;

const toastStore = {
  toasts: [] as Toast[],
  listeners: new Set<() => void>(),

  add(text: string | ReactNode, type: "success" | "warning" | "error") {
    const id = toastId++;

    const toast: Toast = {
      id,
      text,
      type,
    };

    toast.remaining = 5000;
    toast.start = Date.now();

    const close = () => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.notify();
    };

    toast.timeout = setTimeout(close, toast.remaining);

    toast.pause = () => {
      if (!toast.timeout) return;
      clearTimeout(toast.timeout);
      toast.timeout = undefined;
      toast.remaining! -= Date.now() - toast.start!;
    };

    toast.resume = () => {
      if (toast.timeout) return;
      toast.start = Date.now();
      toast.timeout = setTimeout(close, toast.remaining);
    };

    this.toasts.push(toast);
    this.notify();
  },

  remove(id: number) {
    toastStore.toasts = toastStore.toasts.filter((t) => t.id !== id);
    toastStore.notify();
  },

  subscribe(listener: () => void) {
    toastStore.listeners.add(listener);
    return () => {
      toastStore.listeners.delete(listener);
    };
  },

  notify() {
    toastStore.listeners.forEach((fn) => fn());
  },
};

const ToastContainer = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [shownIds, setShownIds] = useState<number[]>([]);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const measureRef = (toast: Toast) => (node: HTMLDivElement | null) => {
    if (node && toast.measuredHeight == null) {
      toast.measuredHeight = node.getBoundingClientRect().height;
      toastStore.notify();
    }
  };

  useEffect(() => {
    setToasts([...toastStore.toasts]);

    return toastStore.subscribe(() => {
      setToasts([...toastStore.toasts]);
    });
  }, []);

  useEffect(() => {
    const unseen = toasts.filter((t) => !shownIds.includes(t.id)).map((t) => t.id);
    if (unseen.length > 0) {
      requestAnimationFrame(() => {
        setShownIds((prev) => [...prev, ...unseen]);
      });
    }
  }, [toasts]);

  const lastVisibleCount = 3;
  const lastVisibleStart = Math.max(0, toasts.length - lastVisibleCount);

  const getFinalTransform = (index: number, stack: Toast[]) => {
    if (index === stack.length - 1) {
      return "none";
    }
    const offset = stack.length - 1 - index;
    let translateY = stack[stack.length - 1]?.measuredHeight || 63;
    for (let i = stack.length - 1; i > index; i--) {
      if (isHovered) {
        translateY += (stack[i - 1]?.measuredHeight || 63) + 10;
      } else {
        translateY += 20;
      }
    }
    const z = -offset;
    const scale = isHovered ? 1 : 1 - 0.05 * offset;
    return `translate3d(0, calc(100% - ${translateY}px), ${z}px) scale(${scale})`;
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    toastStore.toasts.forEach((t) => t.pause?.());
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    toastStore.toasts.forEach((t) => t.resume?.());
  };

  const visibleToasts = toasts.slice(lastVisibleStart);
  const containerHeight = visibleToasts.reduce((acc, toast) => {
    return acc + (toast.measuredHeight ?? 63);
  }, 0);

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] pointer-events-none w-[420px]"
      style={{ height: containerHeight }}
    >
      <div
        className="relative pointer-events-auto w-full"
        style={{ height: containerHeight }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {visibleToasts.map((toast, index) => {
          return (
            <div
              key={toast.id}
              ref={measureRef(toast)}
              className={clsx(
                "absolute right-0 bottom-0 rounded-xl leading-[21px] p-4 h-fit backdrop-blur-md border",
                {
                  success: "bg-green-500/10 border-green-500/30 text-white",
                  warning: "bg-amber-500/10 border-amber-500/30 text-white",
                  error: "bg-red-500/10 border-red-500/30 text-white",
                }[toast.type]
              )}
              style={{
                width: 420,
                transition: "all .35s cubic-bezier(.25,.75,.6,.98)",
                transform: shownIds.includes(toast.id)
                  ? getFinalTransform(index, visibleToasts)
                  : "translate3d(0, 100%, 150px) scale(1)",
                boxShadow:
                  "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.3), inset -3px -3px 0.5px -3px rgba(255,255,255,0.25), inset 0 0 6px 6px rgba(255,255,255,0.08)",
                opacity: shownIds.includes(toast.id) ? 1 : 0,
              }}
            >
              <div className="flex flex-col items-center justify-between text-[.875rem]">
                <div className="w-full h-full flex items-center justify-between gap-4">
                  <span>{toast.text}</span>
                  <button
                    onClick={() => toastStore.remove(toast.id)}
                    className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                  >
                    <CloseIcon
                      className={
                        {
                          success: "fill-white",
                          warning: "fill-white",
                          error: "fill-white",
                        }[toast.type]
                      }
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const mountContainer = () => {
  if (root) return;
  const el = document.createElement("div");
  el.className = "fixed bottom-4 right-4 z-[9999]";
  document.body.appendChild(el);
  root = createRoot(el);
  root.render(<ToastContainer />);
};

export const useToast = () => {
  return {
    success: useCallback((text: string) => {
      mountContainer();
      toastStore.add(text, "success");
    }, []),
    warning: useCallback((text: string) => {
      mountContainer();
      toastStore.add(text, "warning");
    }, []),
    error: useCallback((text: string) => {
      mountContainer();
      toastStore.add(text, "error");
    }, []),
  };
};
