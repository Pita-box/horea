import type { PasswordValidationResult } from './password';

export const AUTH_MESSAGES = {
  invalidEmail: 'Zadejte platný email.',
  duplicateEmail: 'Účet s tímto emailem již existuje.',
  missingTerms: 'Potvrďte prosím souhlas s podmínkami služby.',
  missingDpa: 'Potvrďte prosím souhlas se zpracováním osobních údajů.',
  invalidCredentials: 'Nesprávný email nebo heslo.',
  emailNotConfirmed: 'Ověřte si nejdřív email.',
  forgotPasswordSent: 'Pokud existuje účet s tímto emailem, byl odeslán odkaz pro obnovení hesla.',
  passwordUpdated: 'Heslo bylo změněno. Přihlaste se prosím znovu.',
} as const;

export function getPasswordMessage(
  reason: Exclude<PasswordValidationResult, { ok: true }>['reason'],
) {
  switch (reason) {
    case 'too_short':
      return 'Heslo musí mít alespoň 8 znaků.';
    case 'no_uppercase':
      return 'Heslo musí obsahovat alespoň jedno velké písmeno.';
    case 'no_digit':
      return 'Heslo musí obsahovat alespoň jednu číslici.';
  }
}
