import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import { ChangePassword } from '../../src/pages/ChangePassword';

function renderChangePassword() {
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ChangePassword />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ChangePassword (UI-02, BR-10)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Continue is disabled until all three password rules and the confirm match are satisfied', () => {
    renderChangePassword();
    const continueButton = screen.getByRole('button', { name: /continue/i });

    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'short1' } });
    expect(continueButton).toBeDisabled(); // too short, missing nothing else

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'longenough' } });
    expect(continueButton).toBeDisabled(); // no digit

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'longenough1' } });
    expect(continueButton).toBeDisabled(); // confirm not yet filled

    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'different1' } });
    expect(continueButton).toBeDisabled(); // confirm mismatch

    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'longenough1' } });
    expect(continueButton).toBeEnabled();
  });

  it('the live checklist marks each rule satisfied as the password meets it', () => {
    renderChangePassword();

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'abc' } });
    expect(screen.getByText(/at least 8 characters/i)).toHaveClass('text-muted');
    expect(screen.getByText(/contains a letter/i)).toHaveClass('text-success');
    expect(screen.getByText(/contains a number/i)).toHaveClass('text-muted');

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'abcdefgh1' } });
    expect(screen.getByText(/at least 8 characters/i)).toHaveClass('text-success');
    expect(screen.getByText(/contains a letter/i)).toHaveClass('text-success');
    expect(screen.getByText(/contains a number/i)).toHaveClass('text-success');
  });
});
