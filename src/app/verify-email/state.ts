export type ResendVerificationState = {
  status: 'success' | 'error' | null;
  message: string | null;
  fieldErrors: {
    email?: string;
  };
};

export const INITIAL_RESEND_VERIFICATION_STATE: ResendVerificationState = {
  status: null,
  message: null,
  fieldErrors: {},
};
