export type SlugStepState = {
  message: string | null;
  fieldErrors: {
    businessName?: string;
  };
};

export type SlugCheckResult = {
  kind: 'idle' | 'ok' | 'error';
  slug: string;
  previewUrl: string;
  message: string | null;
};

export const INITIAL_SLUG_STEP_STATE: SlugStepState = {
  message: null,
  fieldErrors: {},
};
