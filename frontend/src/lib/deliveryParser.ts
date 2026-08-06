/**
 * Parser for supplier "rich delivery" blobs (HubX account-delivery documents).
 *
 * Real-world shape (labels and values on SEPARATE lines):
 *
 *   ╔══════════════════════════╗
 *   ║ 📦  Coursera Premium Readymade
 *   ║ 🔖  VEX-F6B9F6A0
 *   ║ 👥  Total accounts: 1
 *   ║ 🕒  Delivered: 2026-08-06 07:20 UTC
 *   ╚══════════════════════════╝
 *   👤  ACCOUNT 1 of 1
 *   📄  Coursera_Delivery_175.txt
 *   Coursera Delivery
 *   Email Login:
 *   https://mail.tm/en/
 *   Email:
 *   jim00055333@web-library.net
 *   ...
 *
 * Falls back gracefully: `rich=false` means "plain key list" (old behavior).
 */

export interface DeliveryField {
  label: string;
  value: string;
  isUrl: boolean;
}

export interface DeliveryStep {
  title: string;
  url?: string;
  fields: DeliveryField[];
}

export interface DeliveryNote {
  text: string;
  url?: string;
}

export interface DeliveryAccount {
  index: number;
  total: number;
  fileName?: string;
  subtitle?: string;
  steps: DeliveryStep[];
  notes: DeliveryNote[];
}

export interface ParsedDelivery {
  rich: boolean;
  title?: string;
  code?: string;
  accountsCount?: string;
  deliveredAt?: string;
  accounts: DeliveryAccount[];
}

const URL_RE = /^https?:\/\/\S+$/i;
const SEPARATOR_RE = /^[═━─\-–—╔╗╚╝║\s·]+$/;
const STEP_STARTER_RE = /login|sign ?in|portal|website|site|page|link|open|url|dashboard|panel/i;

function isSeparator(line: string): boolean {
  return SEPARATOR_RE.test(line);
}

function afterEmoji(line: string, emoji: string): string | undefined {
  if (!line.includes(emoji)) return undefined;
  return line.split(emoji)[1]?.trim() || undefined;
}

/** Lines like "Total accounts: 1" → "1"; falls back to the whole string. */
function valueAfterColon(text: string): string {
  const idx = text.indexOf(':');
  return idx >= 0 ? text.slice(idx + 1).trim() : text.trim();
}

interface BodyItem {
  kind: 'field' | 'note';
  field?: DeliveryField;
  note?: DeliveryNote;
}

/** Parse the free-form body of one account section into fields + notes. */
function parseBodyItems(lines: string[]): { subtitle?: string; items: BodyItem[] } {
  const clean = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSeparator(l) && !l.includes('End of delivery'));

  const items: BodyItem[] = [];
  let subtitle: string | undefined;
  let sawField = false;

  for (let i = 0; i < clean.length; i++) {
    const line = clean[i];
    const next = clean[i + 1];

    // "Label:" followed by a value line → credential field.
    // Length-capped so instruction sentences ending with ':' stay notes.
    if (line.endsWith(':') && line.length <= 42 && next && !next.endsWith(':')) {
      sawField = true;
      const value = next.trim();
      items.push({
        kind: 'field',
        field: { label: line.slice(0, -1).trim(), value, isUrl: URL_RE.test(value) },
      });
      i++; // consume value line
      continue;
    }

    // Inline "Label: value" (single-line variant)
    const inline = line.match(/^([A-Za-z][A-Za-z0-9 /_()\-]{1,40}):\s+(\S.*)$/);
    if (inline && !URL_RE.test(line)) {
      sawField = true;
      const value = inline[2].trim();
      items.push({
        kind: 'field',
        field: { label: inline[1].trim(), value, isUrl: URL_RE.test(value) },
      });
      continue;
    }

    // Bare URL → attach to the previous note when possible
    if (URL_RE.test(line)) {
      const last = items[items.length - 1];
      if (last?.kind === 'note' && last.note && !last.note.url) {
        last.note.url = line;
      } else {
        items.push({ kind: 'note', note: { text: '', url: line } });
      }
      continue;
    }

    // Plain text. Before any field it is the account subtitle; otherwise a note.
    if (!sawField && items.length === 0) {
      subtitle = line;
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === 'note' && last.note && !last.note.url) {
      last.note.text = last.note.text ? `${last.note.text} ${line}` : line;
    } else {
      items.push({ kind: 'note', note: { text: line } });
    }
  }

  return { subtitle, items };
}

/** Group fields into action steps: "Email Login: <url>" starts a step, following fields belong to it. */
function groupSteps(items: BodyItem[]): { steps: DeliveryStep[]; notes: DeliveryNote[] } {
  const steps: DeliveryStep[] = [];
  const notes: DeliveryNote[] = [];
  let current: DeliveryStep | null = null;

  for (const item of items) {
    if (item.kind === 'note' && item.note) {
      notes.push(item.note);
      continue;
    }
    const field = item.field!;
    if (field.isUrl && STEP_STARTER_RE.test(field.label)) {
      current = { title: field.label, url: field.value, fields: [] };
      steps.push(current);
    } else {
      if (!current) {
        current = { title: 'Credentials', fields: [] };
        steps.push(current);
      }
      current.fields.push(field);
    }
  }

  // Drop steps that have no fields AND no url (defensive)
  return { steps: steps.filter((s) => s.url || s.fields.length > 0), notes };
}

export function parseDelivery(raw: string): ParsedDelivery {
  const result: ParsedDelivery = { rich: false, accounts: [] };
  if (!raw || !raw.trim()) return result;

  const lines = raw.split('\n');
  const hasBox = lines.some((l) => l.trim().startsWith('╔'));
  const hasAccount = lines.some((l) => l.includes('👤'));
  if (!hasBox && !hasAccount) return result; // plain key list — caller uses fallback UI

  result.rich = true;

  // ---- Header box ----
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('║')) {
      const inner = trimmed.replace(/^║/, '').replace(/║$/, '').trim();
      const title = afterEmoji(inner, '📦');
      const code = afterEmoji(inner, '🔖');
      const accounts = afterEmoji(inner, '👥');
      const delivered = afterEmoji(inner, '🕒');
      if (title) result.title = title;
      if (code) result.code = code;
      if (accounts) result.accountsCount = valueAfterColon(accounts);
      if (delivered) result.deliveredAt = valueAfterColon(delivered);
    }
    if (trimmed.startsWith('╚')) {
      bodyStart = i + 1;
      break;
    }
  }

  // ---- Split body into account sections on the 👤 marker ----
  const bodyLines = lines.slice(bodyStart);
  const sections: { header?: string; lines: string[] }[] = [];
  let currentSection: { header?: string; lines: string[] } = { lines: [] };

  for (const line of bodyLines) {
    if (line.includes('👤')) {
      if (currentSection.lines.length > 0 || currentSection.header) sections.push(currentSection);
      currentSection = { header: line.trim(), lines: [] };
    } else {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.length > 0 || currentSection.header) sections.push(currentSection);

  for (const section of sections) {
    const account: DeliveryAccount = { index: 1, total: 1, steps: [], notes: [] };

    if (section.header) {
      const m = section.header.match(/account\s+(\d+)\s+of\s+(\d+)/i);
      if (m) {
        account.index = parseInt(m[1], 10);
        account.total = parseInt(m[2], 10);
      }
    }

    // File name line (📄) — pull it out of the section lines
    const contentLines: string[] = [];
    for (const line of section.lines) {
      const fileName = afterEmoji(line.trim(), '📄');
      if (fileName) account.fileName = fileName;
      else contentLines.push(line);
    }

    const { subtitle, items } = parseBodyItems(contentLines);
    account.subtitle = subtitle;
    const { steps, notes } = groupSteps(items);
    account.steps = steps;
    account.notes = notes;

    // Skip entirely empty sections
    if (account.steps.length > 0 || account.notes.length > 0 || account.subtitle) {
      result.accounts.push(account);
    }
  }

  // Header parsed but body yielded nothing usable → treat as plain keys
  if (result.accounts.length === 0) {
    result.rich = false;
  }

  // Multiple blobs (quantity > 1) each self-number "ACCOUNT 1 of 1" —
  // renumber sequentially across the whole delivery.
  result.accounts.forEach((a, i) => {
    a.index = i + 1;
    a.total = result.accounts.length;
  });

  return result;
}

/* ------------------------------------------------------------------ */
/* Guide model — turns a parsed account into buyer-facing steps.      */
/* ------------------------------------------------------------------ */

export interface GuideStep {
  kind: 'service' | 'inbox';
  /** Service name only, e.g. "Coursera" (login/sign-in wording stripped). */
  service: string;
  url?: string;
  fields: DeliveryField[];
}

const INBOX_RE = /mail|inbox|gmail|outlook|hotmail|proton|webmail|temp-?mail/i;
const IDENTITY_RE = /e-?mail|user(name)?|login|account/i;
const PASSWORD_RE = /pass(word)?/i;

/**
 * Builds the customer guide for one account:
 * - every service-login step is completed with the account email
 *   (suppliers list the email once, under the inbox step — buyers need
 *   it on the service login too);
 * - the email-inbox step is moved last (it exists for verification codes).
 */
export function buildGuide(account: DeliveryAccount): GuideStep[] {
  const allFields = account.steps.flatMap((s) => s.fields);
  const emailField = allFields.find((f) => /e-?mail/i.test(f.label) && !PASSWORD_RE.test(f.label));

  const guide: GuideStep[] = account.steps.map((step) => {
    const isInbox = INBOX_RE.test(step.title) || (step.url ? INBOX_RE.test(step.url) : false);
    const service =
      step.title.replace(/log\s?-?ins?|sign\s?-?ins?|portal|dashboard|panel/gi, '').trim() || step.title;

    const fields = [...step.fields];
    const hasIdentity = fields.some((f) => IDENTITY_RE.test(f.label) && !PASSWORD_RE.test(f.label));
    if (!isInbox && emailField && !hasIdentity) {
      fields.unshift({ label: 'Email', value: emailField.value, isUrl: false });
    }
    return { kind: isInbox ? 'inbox' : 'service', service, url: step.url, fields };
  });

  guide.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'inbox' ? 1 : -1));
  return guide;
}
