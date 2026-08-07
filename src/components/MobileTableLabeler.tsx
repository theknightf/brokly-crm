'use client';
import { useEffect } from 'react';

// Annotates every <table class="table-mobile"> so CSS can turn it into a
// card-based list on small screens. Each <td> gets a data-label from its
// matching <th>, used as the card key. Uses a MutationObserver so tables
// rendered after navigation or tab switches are handled too.
export function MobileTableLabeler() {
  useEffect(() => {
    const done = new WeakSet<HTMLTableElement>();

    function annotate(table: HTMLTableElement) {
      if (done.has(table)) return;
      done.add(table);
      const head = table.querySelector('thead');
      const labels = head
        ? Array.from(head.querySelectorAll('th')).map((el) => el.textContent?.trim() ?? '')
        : [];
      table.querySelectorAll('tbody tr').forEach((tr) => {
        Array.from(tr.querySelectorAll(':scope > td')).forEach((td, i) => {
          const label = labels[i] || td.getAttribute('data-label') || '';
          if (label) td.setAttribute('data-label', label);
        });
      });
    }

    function scan() {
      document
        .querySelectorAll('table.table-mobile')
        .forEach((t) => annotate(t as HTMLTableElement));
    }

    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(scan, 500);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
