import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import App from '../../src/App';

describe('AppShell', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows the Requester Selection screen when no Requester is selected', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Anong Srisai' }],
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'TokTickIT' })).toBeInTheDocument();
  });

  it('shows the selected Requester name and a Change Requester action after Continue', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Anong Srisai' }],
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeEnabled();
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText('Anong Srisai')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /change requester/i })).toBeInTheDocument();
  });

  it('returns to the Requester Selection screen when Change Requester is used', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, name: 'Anong Srisai' }],
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeEnabled();
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /change requester/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /change requester/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });
});
