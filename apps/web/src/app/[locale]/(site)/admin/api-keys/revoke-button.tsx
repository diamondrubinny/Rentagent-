'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminRevokeApiKey } from './actions';

export function AdminRevokeButton({ id, describedBy }: { id: string; describedBy: string }) {
  const t = useTranslations('ApiKeys');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-describedby={describedBy}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t('revokeConfirm'))) return;
        startTransition(async () => {
          await adminRevokeApiKey(id);
          router.refresh();
        });
      }}
    >
      {t('revoke')}
    </button>
  );
}
