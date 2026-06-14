export type ResetPasswordField = 'password' | 'passwordConfirm';

export type ResetPasswordState = {
  message: string | null;
  fieldErrors: Partial<Record<ResetPasswordField, string>>;
};

export const INITIAL_RESET_PASSWORD_STATE: ResetPasswordState = {
  message: null,
  fieldErrors: {},
};
