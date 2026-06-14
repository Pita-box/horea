export const RESEND_TEST_MODE_ERROR_MESSAGE =
  'Resend je v test režimu. Teď lze posílat jen na email vlastníka Resend účtu. Pro jiné příjemce ověřte doménu v Resend a nastavte RESEND_FROM_EMAIL na adresu z ověřené domény.';

type ErrorLike = {
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

export function getResendErrorMessage(error: unknown): string | null {
  if (!isErrorLike(error) || typeof error.message !== 'string') {
    return null;
  }

  const message = error.message.toLowerCase();
  const status = error.statusCode ?? error.status;

  if (
    status === 403 &&
    (message.includes('can only send testing emails') ||
      message.includes('verify a domain at resend.com/domains'))
  ) {
    return RESEND_TEST_MODE_ERROR_MESSAGE;
  }

  return null;
}
