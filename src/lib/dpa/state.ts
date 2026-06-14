import { CURRENT_DPA_VERSION } from './version';

export type DpaAcceptanceState = {
  dpa_version_accepted: string | null;
  dpa_accepted_at: string | null;
};

export function needsReacceptance(userDpaVersion: string | null): boolean {
  return userDpaVersion !== CURRENT_DPA_VERSION;
}

export function nextDpaAcceptanceState(
  state: DpaAcceptanceState,
  acceptedAt: string,
): DpaAcceptanceState {
  if (!needsReacceptance(state.dpa_version_accepted)) {
    return state;
  }

  return {
    dpa_version_accepted: CURRENT_DPA_VERSION,
    dpa_accepted_at: acceptedAt,
  };
}
