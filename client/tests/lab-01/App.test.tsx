import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DiagnosticsPage } from '../../src/pages/DiagnosticsPage';

describe('DiagnosticsPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<DiagnosticsPage />);
  });

  it('shows the TokTickIT heading', () => {
    render(<DiagnosticsPage />);
    expect(screen.getByText('TokTickIT IT Service Desk')).toBeInTheDocument();
  });

  it('shows a loading state, then success, when Check System is clicked', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', service: 'TokTickIT API' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: 'Account and Access' },
          { id: 2, name: 'Hardware' },
          { id: 3, name: 'Software' },
          { id: 4, name: 'Network' },
        ],
      } as Response);

    render(<DiagnosticsPage />);

    fireEvent.click(screen.getByRole('button', { name: /check system/i }));

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('System Status: Online')).toBeInTheDocument();
    });

    expect(screen.getByText('Hardware')).toBeInTheDocument();
  });
});
