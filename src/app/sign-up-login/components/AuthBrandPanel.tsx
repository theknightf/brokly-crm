import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const features = [
  'Capture and qualify leads from all property portals',
  'Never miss a follow-up with smart reminders',
  'Track your full pipeline from inquiry to closing',
  'Real-time team performance and conversion reports',
];

export default function AuthBrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-col justify-between bg-primary px-12 py-14 relative overflow-hidden flex-shrink-0">
      {/* Background decoration */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="absolute bottom-0 -left-16 w-64 h-64 rounded-full bg-blue-800/30 blur-3xl" />
      <div className="relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-16">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L20 10H17V20H5V10H2L11 2Z" fill="white" />
            </svg>
          </div>
          <span className="font-bold text-xl text-white">Brokly</span>
        </div>

        <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
          Close more deals,
          <br />
          stress less.
        </h1>
        <p className="text-blue-100 text-base leading-relaxed mb-10">
          The CRM built specifically for real estate brokerages. Manage your entire pipeline from
          first inquiry to final closing.
        </p>

        <ul className="space-y-4">
          {features?.map((f, i) => (
            <li key={`feature-${i + 1}`} className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-blue-200 mt-0.5 flex-shrink-0" />
              <span className="text-blue-50 text-sm leading-snug">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Stats strip */}
      <div className="relative z-10 flex flex-col gap-4 mt-12">
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: '2,400+', label: 'Active brokers' },
            { value: '18,000+', label: 'Leads tracked' },
            { value: '94%', label: 'Retention rate' },
          ]?.map((stat) => (
            <div
              key={`stat-${stat?.label}`}
              className="bg-white/10 rounded-xl px-4 py-3 text-center backdrop-blur-sm"
            >
              <p className="text-white font-bold text-lg tabular-nums">{stat?.value}</p>
              <p className="text-blue-200 text-xs mt-0.5">{stat?.label}</p>
            </div>
          ))}
        </div>
        <p className="text-blue-300/60 text-xs text-center">Made by Faris Mustafa</p>
      </div>
    </div>
  );
}
