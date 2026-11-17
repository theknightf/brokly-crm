'use client';
import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { countryCodeOfPhone, isInternationalPhone } from '@/lib/phone';

/** "International" tag for lead cards: shown for every non-Egyptian number, with its country code when known. Renders nothing otherwise. */
export function IntlBadge({ phone, className = '' }: { phone?: string | null; className?: string }) {
  const { t } = useLanguage();
  if (!isInternationalPhone(phone)) return null;
  const code = countryCodeOfPhone(phone);
  return (
    <span
      title={code ? t('common.intlTitleCode', { code }) : t('common.intlTitle')}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:text-sky-300 ${className}`}
    >
      <Globe size={10} aria-hidden />
      {t('common.intlShort')}
      {code && <span dir="ltr">+{code}</span>}
    </span>
  );
}
