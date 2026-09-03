import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequesterProvider } from '../../src/context/RequesterContext';
import { RequesterSelector } from '../../src/pages/RequesterSelector';

function renderSelector() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <RequesterSelector />
      </RequesterProvider>
    </MemoryRouter>,
  );
}

describe('RequesterSelector', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows a loading state with Continue disabled while Requesters load', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

    renderSelector();

    expect(screen.getByText(/loading development requesters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('shows the empty state when no active Requesters exist', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/no active development requesters/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('shows a safe error state when the request fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/unable to load development requesters/i)).toBeInTheDocument();
    });
  });

  it('enables Continue only after a Requester is chosen', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 1, name: 'Anong Srisai' },
        { id: 2, name: 'Kritsada Boonmee' },
      ],
    } as Response);

    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeEnabled();
    });

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });

    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('shows the explanatory text making clear this is not a login screen', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

    renderSelector();

    expect(screen.getByText(/this is not a login screen/i)).toBeInTheDocument();
  });
});
