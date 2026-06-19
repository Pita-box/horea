import { describe, expect, it } from 'vitest';

import {
  combinedDuration,
  combinedPrice,
  joinServiceNames,
  type CombinableService,
} from '../combine';

const services: CombinableService[] = [
  { name: 'Dámský střih', durationMinutes: 45, priceCzk: 450, position: 0 },
  { name: 'Mytí', durationMinutes: 15, priceCzk: 0, position: 1 },
  { name: 'Foukání', durationMinutes: 30, priceCzk: 250, position: 2 },
];

describe('combinedDuration', () => {
  it('sečte délky všech služeb', () => {
    expect(combinedDuration(services)).toBe(90);
  });

  it('vrátí 0 pro prázdný seznam', () => {
    expect(combinedDuration([])).toBe(0);
  });

  it('vrátí délku jediné služby (mezní případ n = 1)', () => {
    expect(combinedDuration([services[0]])).toBe(45);
  });
});

describe('combinedPrice', () => {
  it('sečte ceny všech služeb', () => {
    expect(combinedPrice(services)).toBe(700);
  });

  it('vrátí 0 pro prázdný seznam', () => {
    expect(combinedPrice([])).toBe(0);
  });

  it('započítá službu s nulovou cenou', () => {
    expect(combinedPrice([services[1]])).toBe(0);
  });
});

describe('joinServiceNames', () => {
  it('spojí názvy oddělovačem " + " v pořadí position', () => {
    expect(joinServiceNames(services)).toBe('Dámský střih + Mytí + Foukání');
  });

  it('seřadí podle position bez ohledu na pořadí ve vstupu', () => {
    const shuffled: CombinableService[] = [services[2], services[0], services[1]];
    expect(joinServiceNames(shuffled)).toBe('Dámský střih + Mytí + Foukání');
  });

  it('zachová pořadí prvků, když position chybí', () => {
    const noPositions: CombinableService[] = [
      { name: 'A', durationMinutes: 10, priceCzk: 0 },
      { name: 'B', durationMinutes: 10, priceCzk: 0 },
    ];
    expect(joinServiceNames(noPositions)).toBe('A + B');
  });

  it('vrátí samotný název pro jedinou službu', () => {
    expect(joinServiceNames([services[0]])).toBe('Dámský střih');
  });

  it('vrátí prázdný řetězec pro prázdný seznam', () => {
    expect(joinServiceNames([])).toBe('');
  });
});
