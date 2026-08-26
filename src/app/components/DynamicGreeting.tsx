'use client';

import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Simple, professional greeting bucketed by time of day, using the user's
// first name. No slang — just a clean, friendly welcome.
const TIME_GREETINGS: { from: number; to: number; line: string }[] = [
  { from: 5, to: 12, line: 'Good morning, {name} 👋' },
  { from: 12, to: 18, line: 'Good afternoon, {name} ☀️' },
  { from: 18, to: 24, line: 'Good evening, {name} 🌙' },
  { from: 0, to: 5, line: 'Hi there, {name} 🌌' },
];

export default function DynamicGreeting() {
  const { profile, user } = useAuth();

  const firstName = useMemo(() => {
    const full =
      profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
    return full.split(' ')[0] || 'friend';
  }, [profile, user]);

  const line = useMemo(() => {
    const hour = new Date().getHours();
    const bucket = TIME_GREETINGS.find((g) => hour >= g.from && hour < g.to) || TIME_GREETINGS[1];
    return bucket.line.replace('{name}', firstName);
  }, [firstName]);

  return (
    <h1 className="page-title">
      {line}
      <span className="block text-sm font-medium text-muted-foreground mt-1">
        Here&apos;s what needs your attention today.
      </span>
    </h1>
  );
}
