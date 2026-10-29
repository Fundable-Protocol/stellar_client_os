'use client';

import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { BackerDigestFrequency } from '@/lib/backer-digest-schedule';

interface BackerDigestPreferenceToggleProps {
  backerId?: string;
  defaultEmail?: string;
}

export function BackerDigestPreferenceToggle({
  backerId,
  defaultEmail = '',
}: BackerDigestPreferenceToggleProps) {
  const [frequency, setFrequency] = useState<BackerDigestFrequency>('off');
  const [email, setEmail] = useState(defaultEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!backerId) return;
    let cancelled = false;
    fetch(`/api/backers/digest-preferences?backerId=${encodeURIComponent(backerId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.preference) return;
        setFrequency(data.preference.frequency);
        if (data.preference.email) setEmail(data.preference.email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backerId]);

  async function save(next: BackerDigestFrequency, nextEmail = email) {
    if (!backerId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const previous = frequency;
    setFrequency(next);
    try {
      const res = await fetch('/api/backers/digest-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backerId,
          frequency: next,
          email: nextEmail || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFrequency(previous);
        setError(data.error ?? 'Failed to save digest preference');
        return;
      }
      setSaved(true);
    } catch {
      setFrequency(previous);
      setError('Failed to save digest preference');
    } finally {
      setSaving(false);
    }
  }

  const enabled = frequency !== 'off';

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">Backer Digest Email</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              One email summarising updates across all campaigns you have backed.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Enable backer digest email"
          checked={enabled}
          disabled={saving || !backerId}
          onChange={(e) => save(e.target.checked ? 'daily' : 'off')}
        />
      </div>

      {!backerId && (
        <p className="text-xs text-muted-foreground italic">
          Connect your wallet to manage your digest.
        </p>
      )}

      {enabled && (
        <div className="pt-2 border-t border-border/60 space-y-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Digest frequency">
            {(['daily', 'weekly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={frequency === option}
                disabled={saving}
                onClick={() => save(option)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  frequency === option
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border/50 text-muted-foreground'
                }`}
              >
                {option === 'daily' ? 'Daily · 8 AM' : 'Weekly · Monday 8 AM'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Delivered at 8 AM in your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </p>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email && save(frequency, email)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            aria-label="Digest email address"
          />
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}
      {saved && !error && <p className="text-xs text-emerald-500">Preference saved.</p>}
    </div>
  );
}
