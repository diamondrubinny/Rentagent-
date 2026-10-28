'use client';

import { isBuiltinLocale, nameField } from '@rentagent/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/components/forms';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from '@/lib/auth-errors';

interface ProfileFormProps {
  name: string;
  email: string;
  locale: string;
  locales: { code: string; name: string }[];
}

export function ProfileForm({ name, email, locale, locales }: ProfileFormProps) {
  const t = useTranslations('Account.profile');
  const tValidation = useTranslations('Validation');
  const tErrors = useTranslations('AuthErrors');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string }>();
  const [nameError, setNameError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsedName = nameField.safeParse(String(form.get('name') ?? ''));
    const nextLocale = String(form.get('locale') ?? '');
    if (!parsedName.success) {
      setNameError(tValidation(parsedName.error.issues[0]?.message ?? 'required'));
      return;
    }
    setNameError(undefined);
    setPending(true);
    const { error } = await authClient.updateUser({
      name: parsedName.data,
      locale: isBuiltinLocale(nextLocale) ? nextLocale : undefined,
    });
    setPending(false);
    setMessage(
      error
        ? { tone: 'error', text: tErrors(authErrorKey(error)) }
        : { tone: 'success', text: t('saved') },
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <TextField
        name="name"
        label={t('name')}
        defaultValue={name}
        autoComplete="name"
        dir="auto"
        required
        error={nameError}
      />
      <TextField
        name="email"
        type="email"
        label={t('email')}
        hint={t('emailHint')}
        defaultValue={email}
        dir="ltr"
        readOnly
      />
      <div>
        <label htmlFor="profile-locale" className="mb-1 block font-semibold">
          {t('locale')}
        </label>
        <p id="profile-locale-hint" className="mb-1 text-sm text-muted">
          {t('localeHint')}
        </p>
        <select
          id="profile-locale"
          name="locale"
          defaultValue={locale}
          aria-describedby="profile-locale-hint"
          className="field-input"
        >
          {locales.map((option) => (
            <option key={option.code} value={option.code} lang={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pending={pending} pendingLabel={t('saving')}>
        {t('save')}
      </SubmitButton>
    </form>
  );
}
