import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from '../../src/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  // Implemented in Issue 4 (feature/4-category-list) once the real UI replaces this scaffold.
  it.todo('shows the TokTickIT heading');
  it.todo('shows a loading state, then success or error, when Check System is clicked');
});
