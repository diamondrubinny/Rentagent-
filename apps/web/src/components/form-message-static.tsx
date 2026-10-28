import type { ReactNode } from 'react';

const TONES = {
  error: 'border-2 border-danger bg-danger-bg',
  warning: 'border border-border bg-warning-bg',
  success: 'border border-success bg-success-bg text-success',
} as const;

/** Server-rendered notice (no focus management); use FormMessage for client form feedback. */
export function FormMessageStatic({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg p-4 ${TONES[tone]}`}>
      {children}
    </div>
  );
}
