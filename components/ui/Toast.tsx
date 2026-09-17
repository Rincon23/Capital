'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createId } from '@/lib/budget';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  /**
   * Shows a short message at the bottom of the screen. Replaces the bot's ✅ / ↩️ / ⚠️ replies.
   * An `action` (e.g. "Desfazer") adds a button and keeps the message up a little longer.
   */
  showToast: (message: string, kind?: ToastKind, options?: { action?: ToastAction }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 3200;
const WITH_ACTION_MS = 6000;

const STYLES: Record<ToastKind, string> = {
  success: 'bg-success-bg text-success border-success/30',
  error: 'bg-danger-bg text-danger border-danger/30',
  info: 'bg-card text-foreground border-border',
};

const ICONS: Record<ToastKind, string> = { success: '✅', error: '⚠️', info: '↩️' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'success', options?: { action?: ToastAction }) => {
      const id = createId();
      const action = options?.action;
      setToasts((prev) => [...prev, { id, kind, message, action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), action ? WITH_ACTION_MS : VISIBLE_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Above the bottom nav, below the sheets, and never blocking taps when empty. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[45] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) =>
          toast.action ? (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border py-2 pr-2 pl-4 text-left text-sm font-medium shadow-lg ${STYLES[toast.kind]}`}
            >
              <span aria-hidden>{ICONS[toast.kind]}</span>
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action?.onClick();
                }}
                className="min-h-[40px] shrink-0 rounded-lg px-3 font-semibold underline underline-offset-2"
              >
                {toast.action.label}
              </button>
            </div>
          ) : (
            <button
              key={toast.id}
              type="button"
              onClick={() => dismiss(toast.id)}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium shadow-lg ${STYLES[toast.kind]}`}
            >
              <span aria-hidden>{ICONS[toast.kind]}</span>
              <span className="flex-1">{toast.message}</span>
            </button>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
