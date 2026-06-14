export type BusinessConfig = {
  allowParallelSlots: boolean;
  timezone: 'Europe/Prague';
};

export type OpeningHours =
  | {
      closed: true;
    }
  | {
      closed: false;
      opensAt: string;
      closesAt: string;
    };

export type Service = {
  durationMinutes: number;
};

export type Reservation = {
  start: string;
  end: string;
};

export type SlotCalculatorInput = {
  config: BusinessConfig;
  openingHours: OpeningHours;
  service: Service;
  reservations: readonly Reservation[];
};

export type SlotCalculatorOutput = string[];
