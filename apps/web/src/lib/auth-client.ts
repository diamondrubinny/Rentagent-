'use client';

import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient(),
    inferAdditionalFields({
      user: {
        role: { type: 'string', required: false, input: false },
        status: { type: 'string', required: false, input: false },
        locale: { type: 'string', required: false },
      },
    }),
  ],
});
