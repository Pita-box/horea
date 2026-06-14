import type { ServiceInput, ServiceValues } from './schema';

export type ServiceRecord = ServiceValues & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceField = keyof ServiceInput;

export type ServiceActionResult =
  | {
      ok: true;
      service?: ServiceRecord;
      deletedReservationCount?: number;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: Partial<Record<ServiceField, string>>;
    };

export type ListServicesResult =
  | {
      ok: true;
      services: ServiceRecord[];
    }
  | {
      ok: false;
      message: string;
    };

export type ReservationCountResult =
  | {
      ok: true;
      count: number;
    }
  | {
      ok: false;
      message: string;
    };
