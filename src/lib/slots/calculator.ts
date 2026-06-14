import { formatTime, intervalsOverlap, MINUTES_PER_DAY, parseTime } from './time';
import type { Reservation, SlotCalculatorInput, SlotCalculatorOutput } from './types';

const GRID_STEP_MINUTES = 15;
const CLOSES_AT_TOLERANCE_MINUTES = 15;

function isValidDuration(durationMinutes: number): boolean {
  return Number.isInteger(durationMinutes) && durationMinutes > 0;
}

function parseReservation(reservation: Reservation): { start: number; end: number } | null {
  const start = parseTime(reservation.start);
  const end = parseTime(reservation.end);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return null;
  }

  return { start, end };
}

function hasReservationConflict(
  candidateStart: number,
  durationMinutes: number,
  reservations: readonly Reservation[],
): boolean {
  const candidateEnd = candidateStart + durationMinutes;

  return reservations.some((reservation) => {
    const parsed = parseReservation(reservation);

    if (!parsed) {
      return false;
    }

    return intervalsOverlap(candidateStart, candidateEnd, parsed.start, parsed.end);
  });
}

export function calculateSlots(input: SlotCalculatorInput): SlotCalculatorOutput {
  const { config, openingHours, reservations, service } = input;

  if (openingHours.closed || !isValidDuration(service.durationMinutes)) {
    return [];
  }

  const opensAt = parseTime(openingHours.opensAt);
  const closesAt = parseTime(openingHours.closesAt);

  if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt) || opensAt >= closesAt) {
    return [];
  }

  const lastCandidateStart = closesAt + CLOSES_AT_TOLERANCE_MINUTES - service.durationMinutes;
  const slots: string[] = [];

  for (
    let candidateStart = opensAt;
    candidateStart <= lastCandidateStart && candidateStart < MINUTES_PER_DAY;
    candidateStart += GRID_STEP_MINUTES
  ) {
    if (
      !config.allowParallelSlots &&
      hasReservationConflict(candidateStart, service.durationMinutes, reservations)
    ) {
      continue;
    }

    slots.push(formatTime(candidateStart));
  }

  return slots;
}
