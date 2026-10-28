export type SetupFormError = 'rateLimited' | 'alreadyComplete' | 'smtpFailed' | 'generic';

export interface SetupFormState {
  status: 'idle' | 'error';
  formError?: SetupFormError;
  /** Field name -> i18n key under "Validation". */
  fieldErrors?: Record<string, string>;
  /** Submitted non-secret values, used to repopulate the form after an error. */
  values?: Record<string, string>;
}

export const initialSetupState: SetupFormState = { status: 'idle' };
