'use client';
import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import LeadProfileScreen from './LeadProfileScreen';
import MobileLeadProfile from './MobileLeadProfile';

/**
 * /leads/[id]: the phone layout below 640px, the existing desktop screen (unchanged) otherwise.
 * Until the screen width is known a neutral skeleton is shown, so neither layout flashes.
 */
export default function LeadPageSwitch({ leadId }: { leadId: string }) {
  const mobile = useIsMobile();
  if (mobile === null) {
    return (
      <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading lead">
        <div className="dash-card h-44" />
        <div className="dash-card h-72" />
      </div>
    );
  }
  return mobile ? <MobileLeadProfile leadId={leadId} /> : <LeadProfileScreen leadId={leadId} />;
}
