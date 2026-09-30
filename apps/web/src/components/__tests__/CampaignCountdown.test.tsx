import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
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

    expect(screen.getByText('1')).toBeInTheDocument(); // Days
    expect(screen.getByText('02')).toBeInTheDocument(); // Hours
    expect(screen.getByText('15')).toBeInTheDocument(); // Minutes
    expect(screen.getByText('04')).toBeInTheDocument(); // Seconds

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('03')).toBeInTheDocument(); // Seconds goes down to 3
  });

  it('displays Campaign Ended when expired', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    vi.setSystemTime(now);
    const target = new Date(now.getTime() - 1000);

    render(<CampaignCountdown targetDate={target} />);
    expect(screen.getByText('Campaign Ended')).toBeInTheDocument();
  });
});
