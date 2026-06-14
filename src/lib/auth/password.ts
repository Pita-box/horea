export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too_short' | 'no_uppercase' | 'no_digit' };

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Jednotlivé predikáty pravidel pro heslo. Sdílený zdroj pravdy mezi serverovou
 * validací (`validatePassword`) a UI live-checkerem na registraci.
 */
export const passwordChecks = {
  minLength: (password: string) => password.length >= PASSWORD_MIN_LENGTH,
  hasUppercase: (password: string) => /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(password),
  hasDigit: (password: string) => /\d/.test(password),
};

export function validatePassword(password: string): PasswordValidationResult {
  if (!passwordChecks.minLength(password)) {
    return { ok: false, reason: 'too_short' };
  }

  if (!passwordChecks.hasUppercase(password)) {
    return { ok: false, reason: 'no_uppercase' };
  }

  if (!passwordChecks.hasDigit(password)) {
    return { ok: false, reason: 'no_digit' };
  }

  return { ok: true };
}
