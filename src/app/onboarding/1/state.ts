import type { BusinessType } from '@/lib/onboarding/business-types';

export type TypeStepState = {
  message: string | null;
  fieldErrors: {
    type?: string;
  };
};

export const INITIAL_TYPE_STEP_STATE: TypeStepState = {
  message: null,
  fieldErrors: {},
};

export type TypeStepInitialValue = BusinessType | null;
