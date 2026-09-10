/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BootScreen } from './BootScreen.js';

afterEach(cleanup);

describe('BootScreen', () => {
  const base = {
    title: 'Starting',
    lines: [],
    onCancel: () => {},
    showDebug: false,
  };

  it('never moves reported setup progress backwards', () => {
    const { rerender } = render(
      <BootScreen
        {...base}
        progress={{ label: 'A', detail: 'A', progress: 64, stalled: false }}
      />,
    );
    rerender(
      <BootScreen
        {...base}
        progress={{ label: 'B', detail: 'B', progress: 31, stalled: false }}
      />,
    );

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '64',
    );
    expect(
      screen
        .getByRole('progressbar')
        .querySelector('span')
        ?.getAttribute('style'),
    ).toContain('64%');
  });

  it('clamps malformed progress to the track', () => {
    render(
      <BootScreen
        {...base}
        progress={{ label: 'A', detail: 'A', progress: 140, stalled: false }}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '100',
    );
  });
});
