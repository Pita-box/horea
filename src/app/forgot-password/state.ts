export type ForgotPasswordState = {
  message: string | null;
  fieldErrors: {
    email?: string;
  };
};

export const INITIAL_FORGOT_PASSWORD_STATE: ForgotPasswordState = {
  message: null,
  fieldErrors: {},
};
