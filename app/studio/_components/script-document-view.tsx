import type { ReactNode } from 'react';

type HeadingMeta = { lineIndex: number; level: number; title: string; id: string };

export function normalizeScriptMarkdown(content: string) {
  return content
    .replace(/^\s*```(?:markdown|md|text)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gm, '')
    .replace(/^\s*\+-{8,}\+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'script-section';
}

function collectHeadings(lines: string[]) {
  const used = new Map<string, number>();
  const headings: HeadingMeta[] = [];
  lines.forEach((rawLine, lineIndex) => {
    const match = rawLine.trim().match(/^(#{1,3})\s+(.+)$/);
    if (!match) return;
    const base = slugify(match[2]);
    const occurrence = used.get(base) ?? 0;
    used.set(base, occurrence + 1);
    headings.push({
      lineIndex,
      level: match[1].length,
      title: match[2],
      id: occurrence ? `${base}-${occurrence + 1}` : base,
    });
  });
  return headings;
}

// Tolerant of heading level (##/###), bold markers and stray spacing around
// the heading, so a valid dossier that formats the section slightly
// differently does not turn into an endless verification-leak loop.
const editorialHandoffSplit = /\n#{2,3}\s*\**\s*Editorial handoff\s*\**\s*\n/i;

function narrativeOnly(content: string) {
  return normalizeScriptMarkdown(content).split(editorialHandoffSplit)[0].trim();
}

export function getSpokenScriptText(content: string) {
  return narrativeOnly(content)
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,3}\s+/.test(line) && !/^\s*>/.test(line))
    .join(' ')
    .replace(/\[C\d{2,3}\]/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getScriptSignals(content: string) {
  const normalized = normalizeScriptMarkdown(content);
  const narrative = narrativeOnly(normalized);
  const lines = narrative.split(/\r?\n/);
  const headings = collectHeadings(lines);
  const claimIds = new Set([...narrative.matchAll(/\bC\d{2,3}\b/g)].map((match) => match[0]));
  const prose = getSpokenScriptText(normalized);
  const words = prose.match(/[A-Za-z0-9]+(?:[’'][A-Za-z0-9]+)*/g) ?? [];
  const firstMovementIndex = narrative.search(/^##\s+/m);
  const opening = firstMovementIndex >= 0 ? narrative.slice(firstMovementIndex, firstMovementIndex + 700) : narrative.slice(0, 700);
  const status = normalized.match(/Script status:\*{0,2}\s*(READY|NEEDS RESEARCH)\b/i)?.[1]?.toUpperCase() ?? '';
  const bannedOpening = /welcome back|in today['’]s video|in this video\b|before we begin|don['’]t forget to|like and subscribe|smash (?:that|the)|imagine a world|picture this/i.test(opening);
  return {
    headings,
    sectionCount: headings.filter((heading) => heading.level === 2).length,
    claimCount: claimIds.size,
    wordCount: words.length,
    estimatedMinutes: words.length ? Math.max(1, Math.round((words.length / 145) * 10) / 10) : 0,
    status,
    hasEditorialHandoff: editorialHandoffSplit.test(`\n${normalized}\n`),
    hasVerificationLeak: /\[VERIFY\]|NOT VERIFIED|OPEN GAP/i.test(narrative),
    hasRawFence: /```/.test(content),
    bannedOpening,
    hasProductionCue: /\[(?:pause|music|sfx|visual|camera|cut|shot|voice|emphasis|slower|faster)[^\]]*\]/i.test(narrative),
    hasCreatorCta: /\b(?:like and subscribe|subscribe to (?:the|this|our) channel|hit the bell|leave a comment|smash (?:that|the) like)\b/i.test(narrative),
  };
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[C\d{2,3}\]|READY|NEEDS RESEARCH)/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if (/^\[C\d{2,3}\]$/.test(part)) return <span className="script-claim-id" key={key}>{part}</span>;
    if (part === 'READY' || part === 'NEEDS RESEARCH') return <span className={`script-status-token ${part === 'READY' ? 'ready' : 'blocked'}`} key={key}>{part}</span>;
    return part;
  });
}

function isBlockStart(line: string) {
  const value = line.trim();
  return !value || /^#{1,3}\s/.test(value) || /^[-*]\s+/.test(value)
    || /^\d+\.\s+/.test(value) || value.startsWith('>') || /^-{3,}$/.test(value);
}

function ScriptDocument({ content, compact = false }: { content: string; compact?: boolean }) {
  const lines = normalizeScriptMarkdown(content).split(/\r?\n/);
  const headings = collectHeadings(lines);
  const headingByLine = new Map(headings.map((heading) => [heading.lineIndex, heading]));
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const lineIndex = index;
    const line = lines[index].trim();
    if (!line || /^-{3,}$/.test(line)) { index += 1; continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const id = headingByLine.get(lineIndex)?.id;
      const children = renderInline(heading[2], `h-${index}`);
      const number = heading[2].match(/^\d+/)?.[0];
      blocks.push(level === 1
        ? <h1 id={id} key={`h-${index}`}>{children}</h1>
        : level === 2
          ? <h2 id={id} key={`h-${index}`}><span>{number ? number.padStart(2, '0') : '§'}</span>{children}</h2>
          : <h3 id={id} key={`h-${index}`}>{children}</h3>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '), `quote-${index}`)}</blockquote>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '), `p-${index}`)}</p>);
  }

  return <article className={`script-document${compact ? ' compact' : ''}`}>{blocks}</article>;
}

export default function ScriptDocumentView({ content }: { content: string }) {
  const normalized = normalizeScriptMarkdown(content);
  const split = normalized.split(editorialHandoffSplit);
  const narrative = split[0];
  const editorial = split.length > 1 ? `## Editorial handoff\n${split.slice(1).join('\n')}` : '';
  const headings = collectHeadings(narrative.split(/\r?\n/)).filter((heading) => heading.level === 2);
  return (
    <>
      {headings.length ? <nav className="script-document-map" aria-label="Script movements"><span>Story movements</span>{headings.map((heading) => <a href={`#${heading.id}`} key={heading.id}>{heading.title.replace(/^\d+[.)]?\s*/, '')}</a>)}</nav> : null}
      <ScriptDocument content={narrative} />
      {editorial ? <details className="script-editorial"><summary><div><strong>Editorial traceability</strong><span>Claims, qualifications and reconstruction boundaries</span></div><i>＋</i></summary><ScriptDocument content={editorial} compact /></details> : null}
    </>
  );
}
