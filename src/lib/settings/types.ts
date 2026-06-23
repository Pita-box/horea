// Dostupnostní nastavení podniku žije přímo na řádku `businesses`
// (sloupce `allow_parallel_slots` a `auto_approve_reservations`).
// Tyto typy mapují snake_case sloupce DB na camelCase používané v aplikaci.

export type SettingKey = 'allowParallelSlots' | 'autoApproveReservations';

export type AvailabilitySettings = {
  allowParallelSlots: boolean;
  autoApproveReservations: boolean;
};

/** Dostupnost dotčených funkcí dle tarifu (matice `plan_features`). */
export type SettingsEntitlements = {
  autoApprove: boolean;
  parallelSlots: boolean;
};

export type GetSettingsResult =
  | {
      ok: true;
      settings: AvailabilitySettings;
      entitlements: SettingsEntitlements;
    }
  | {
      ok: false;
      message: string;
    };

export type UpdateSettingResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };
