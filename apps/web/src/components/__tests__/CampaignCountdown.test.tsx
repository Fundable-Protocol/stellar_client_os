import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CampaignCountdown } from '../CampaignCountdown';

describe('CampaignCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly and updates the countdown', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    vi.setSystemTime(now);

    const target = new Date(now.getTime() + (1 * 24 * 60 * 60 * 1000) + (2 * 60 * 60 * 1000) + (15 * 60 * 1000) + (4 * 1000));

    render(<CampaignCountdown targetDate={target} />);

    expect(screen.getByText('1')).toBeDefined(); // Days
    expect(screen.getByText('02')).toBeDefined(); // Hours
    expect(screen.getByText('15')).toBeDefined(); // Minutes
    expect(screen.getByText('04')).toBeDefined(); // Seconds

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('03')).toBeDefined(); // Seconds goes down to 3
  });

  it('displays Campaign Ended when expired', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    vi.setSystemTime(now);
    const target = new Date(now.getTime() - 1000);

    render(<CampaignCountdown targetDate={target} />);
    expect(screen.getByText('Campaign Ended')).toBeDefined();
  });
});
