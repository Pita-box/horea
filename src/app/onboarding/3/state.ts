export type ProfileField = 'name' | 'description' | 'phone' | 'email';

export type ProfileStepState = {
  message: string | null;
  fieldErrors: Partial<Record<ProfileField, string>>;
};

export const INITIAL_PROFILE_STEP_STATE: ProfileStepState = {
  message: null,
  fieldErrors: {},
};
