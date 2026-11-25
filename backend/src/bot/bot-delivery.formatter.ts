import { escapeHtml } from '../telegram/telegram.service';

export interface DeliveryField {
  label: string;
  value: string;
  isUrl: boolean;
}

export interface DeliveryAccount {
  index: number;
  total: number;
  fields: DeliveryField[];
  notes: string[];
}

const URL_RE = /^https?:\/\/\S+$/i;
const SEPARATOR_RE = /^[═━─\-–—╔╗╚╝║\s·]+$/;

function isSeparator(line: string): boolean {
  return SEPARATOR_RE.test(line);
}

/**
 * Formats plain license keys OR HubX rich multi-line account deliveries into
 * clean Telegram HTML with tap-to-copy <code> blocks + clickable login URLs.
 */
export function formatDeliveryForTelegram(raw: string): {
  html: string;
  urls: { label: string; url: string }[];
  tooLong: boolean;
} {
  const text = (raw || '').trim();
  if (!text) {
    return { html: '<i>Preparing delivery…</i>', urls: [], tooLong: false };
  }

  const isRich =
    text.includes('👤') ||
    text.includes('Email:') ||
    text.includes('Password:') ||
    text.includes('╔══');

  if (!isRich) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const html = lines.map((l) => `🔑 <code>${escapeHtml(l)}</code>`).join('\n');
    return { html, urls: [], tooLong: html.length > 3200 };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (!line || isSeparator(line) || line.includes('End of delivery')) continue;
    if (line.startsWith('║')) continue; // header box already known from order
    if (/^👤\s*ACCOUNT/i.test(line)) {
      if (current.length) sections.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) sections.push(current);

  const urls: { label: string; url: string }[] = [];
  const seenUrls = new Set<string>();
  const outParts: string[] = [];

  for (const sec of sections) {
    const partLines: string[] = [];
    for (let i = 0; i < sec.length; i++) {
      const line = sec[i];
      const next = sec[i + 1];

      if (/^👤\s*ACCOUNT/i.test(line)) {
        partLines.push(`\n<b>${escapeHtml(line)}</b>`);
        continue;
      }
      if (line.startsWith('📄')) continue;

      if (line.endsWith(':') && line.length <= 42 && next && !next.endsWith(':')) {
        const label = line.slice(0, -1).trim();
        const val = next.trim();
        i++;
        if (URL_RE.test(val)) {
          partLines.push(`🌐 <b>${escapeHtml(label)}:</b> ${escapeHtml(val)}`);
          if (!seenUrls.has(val)) {
            seenUrls.add(val);
            urls.push({ label: `🌐 Open ${label}`, url: val });
          }
        } else {
          partLines.push(`• <b>${escapeHtml(label)}:</b> <code>${escapeHtml(val)}</code>`);
        }
        continue;
      }

      const inline = line.match(/^([A-Za-z][A-Za-z0-9 /_()\-]{1,40}):\s+(\S.*)$/);
      if (inline && !URL_RE.test(line)) {
        const label = inline[1].trim();
        const val = inline[2].trim();
        if (URL_RE.test(val)) {
          partLines.push(`🌐 <b>${escapeHtml(label)}:</b> ${escapeHtml(val)}`);
          if (!seenUrls.has(val)) {
            seenUrls.add(val);
            urls.push({ label: `🌐 Open ${label}`, url: val });
          }
        } else {
          partLines.push(`• <b>${escapeHtml(label)}:</b> <code>${escapeHtml(val)}</code>`);
        }
        continue;
      }

      if (URL_RE.test(line)) {
        partLines.push(`🌐 ${escapeHtml(line)}`);
        if (!seenUrls.has(line)) {
          seenUrls.add(line);
          urls.push({ label: '🌐 Open Link', url: line });
        }
      } else {
        partLines.push(`ℹ️ ${escapeHtml(line)}`);
      }
    }
    outParts.push(partLines.join('\n'));
  }

  const html = outParts.join('\n').trim() || `<pre>${escapeHtml(text)}</pre>`;
  return { html, urls: urls.slice(0, 4), tooLong: html.length > 3200 };
}
