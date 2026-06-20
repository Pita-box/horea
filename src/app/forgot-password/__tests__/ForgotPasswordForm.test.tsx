import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const forgotPasswordActionMock = vi.hoisted(() => vi.fn());

vi.mock('../actions', () => ({
  forgotPasswordAction: forgotPasswordActionMock,
}));

import { ForgotPasswordForm } from '../ForgotPasswordForm';

afterEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordForm', () => {
  it('zavolá akci po kliknutí na tlačítko a zobrazí výslednou hlášku', async () => {
    forgotPasswordActionMock.mockResolvedValue({
      message: 'Pokud účet existuje, poslali jsme odkaz.',
      fieldErrors: {},
    });

    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByPlaceholderText('jmeno@firma.cz'), {
      target: { value: 'test@example.cz' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Odeslat odkaz' }));

    await waitFor(() => {
      expect(forgotPasswordActionMock).toHaveBeenCalledTimes(1);
    });

    const formData = forgotPasswordActionMock.mock.calls[0][0] as FormData;
    expect(formData.get('email')).toBe('test@example.cz');

    expect(await screen.findByText('Pokud účet existuje, poslali jsme odkaz.')).toBeTruthy();
  });

  it('zavolá akci i odesláním formuláře přes Enter (onSubmit)', async () => {
    forgotPasswordActionMock.mockResolvedValue({ message: null, fieldErrors: {} });

    const { container } = render(<ForgotPasswordForm />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    await waitFor(() => {
      expect(forgotPasswordActionMock).toHaveBeenCalledTimes(1);
    });
  });
});
