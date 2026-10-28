'use client';

import { useState, useTransition } from 'react';

export type ActionOutcome =
  | { ok: true; id?: string; message?: string; values?: Record<string, number> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Runs a server action in a transition and keeps its last outcome for display. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const run = (
    action: () => Promise<ActionOutcome>,
    onSuccess?: (result: ActionOutcome & { ok: true }) => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      setOutcome(result);
      if (result.ok) onSuccess?.(result);
    });
  const fieldErrors = outcome && !outcome.ok ? (outcome.fieldErrors ?? {}) : {};
  return { pending, outcome, run, fieldErrors, reset: () => setOutcome(null) };
}
