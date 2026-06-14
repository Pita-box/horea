export type RegisterField = 'email' | 'password' | 'tosAccepted' | 'dpaAccepted';

export type RegisterActionState = {
  message: string | null;
  fieldErrors: Partial<Record<RegisterField, string>>;
};

export const INITIAL_REGISTER_STATE: RegisterActionState = {
  message: null,
  fieldErrors: {},
};
