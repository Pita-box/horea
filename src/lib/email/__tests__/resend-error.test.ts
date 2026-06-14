import { describe, expect, it } from 'vitest';

import { getResendErrorMessage, RESEND_TEST_MODE_ERROR_MESSAGE } from '../resend-error';

describe('getResendErrorMessage', () => {
  it('maps Resend test mode delivery errors', () => {
    const result = getResendErrorMessage({
      statusCode: 403,
      name: 'validation_error',
      message:
        'You can only send testing emails to your own email address. To send emails to other recipients, please verify a domain at resend.com/domains.',
    });

    expect(result).toBe(RESEND_TEST_MODE_ERROR_MESSAGE);
  });

  it('does not map unrelated errors', () => {
    expect(getResendErrorMessage({ statusCode: 500, message: 'Internal server error' })).toBeNull();
  });
});
