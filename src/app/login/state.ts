export type LoginField = 'email' | 'password';

export type LoginActionState = {
  message: string | null;
  fieldErrors: Partial<Record<LoginField, string>>;
  emailNotConfirmed: boolean;
};

export const INITIAL_LOGIN_STATE: LoginActionState = {
  message: null,
  fieldErrors: {},
  emailNotConfirmed: false,
};
