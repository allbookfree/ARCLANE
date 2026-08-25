import type { ReactNode } from 'react';

export type ResearchSource = { title: string; url: string };

type HeadingMeta = { lineIndex: number; level: number; title: string; id: string };

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function sourceClass(url: string) {
  const host = sourceHost(url).toLowerCase();
  if (host.endsWith('.gov') || host.endsWith('.edu') || /(archive|archives|library|museum|university|institute|smithsonian)/.test(host)) return 'institutional';
  if (host.endsWith('.org')) return 'organization';
  return 'general';
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'research-section';
}

export function normalizeResearchMarkdown(content: string) {
  return content
    .replace(/^\s*```(?:markdown|md|text)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gm, '')
    .replace(/^\s*\+-{8,}\+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function renderInline(text: string, keyPrefix: string, sources: ResearchSource[]): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\)|\[E\d+\]|NOT VERIFIED|RECONSTRUCTION|QUALIFIED|VERIFIED|HIGH|MEDIUM|LOW)/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a href={link[2]} target="_blank" rel="noreferrer" key={key}>{link[1]} ↗</a>;
    const evidence = part.match(/^\[E(\d+)\]$/);
    if (evidence) {
      const source = sources[Number(evidence[1]) - 1];
      return source
        ? <a className="research-evidence-link" href={source.url} target="_blank" rel="noreferrer" title={`${source.title} — ${sourceHost(source.url)}`} key={key}>{part}</a>
        : <span className="research-evidence-link unresolved" title="No matching source link was returned" key={key}>{part}</span>;
    }
    if (['VERIFIED', 'QUALIFIED', 'NOT VERIFIED', 'RECONSTRUCTION'].includes(part)) {
      return <span className={`research-status-token ${part.toLowerCase().replace(' ', '-')}`} key={key}>{part}</span>;
    }
    if (['HIGH', 'MEDIUM', 'LOW'].includes(part)) {
      return <span className={`research-confidence-token ${part.toLowerCase()}`} key={key}>{part}</span>;
    }
    return part;
  });
}

function isBlockStart(line: string) {
  const value = line.trim();
  return !value || /^#{1,3}\s/.test(value) || /^[-*]\s+/.test(value)
    || /^\d+\.\s+/.test(value) || value.startsWith('>') || value.startsWith('|') || /^-{3,}$/.test(value);
}

export function getResearchSignals(content: string, sources: ResearchSource[]) {
  const normalized = normalizeResearchMarkdown(content);
  const lines = normalized.split(/\r?\n/);
  const headings = collectHeadings(lines);
  const evidenceIds = new Set([...normalized.matchAll(/\[E(\d+)\]/g)].map((match) => match[1]));
  const unresolvedEvidenceCount = [...evidenceIds].filter((id) => Number(id) < 1 || Number(id) > sources.length).length;
  const claimIds = new Set([...normalized.matchAll(/\bC\d{2,3}\b/g)].map((match) => match[0]));
  const openGapLines = lines.filter((line) => /NOT VERIFIED|\[VERIFY\]|OPEN GAP/i.test(line));
  const institutionalSources = sources.filter((source) => sourceClass(source.url) === 'institutional').length;
  return {
    headings,
    sectionCount: headings.filter((heading) => heading.level === 2).length,
    evidenceReferenceCount: evidenceIds.size,
    unresolvedEvidenceCount,
    claimCount: claimIds.size,
    openGapCount: openGapLines.length,
    institutionalSources,
  };
}

function ResearchDocument({ content, sources }: { content: string; sources: ResearchSource[] }) {
  const lines = normalizeResearchMarkdown(content).split(/\r?\n/);
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
      const children = renderInline(heading[2], `h-${index}`, sources);
      const id = headingByLine.get(lineIndex)?.id;
      const sectionNumber = headingByLine.get(lineIndex)?.title.match(/^\d+/)?.[0];
      blocks.push(level === 1 ? <h2 id={id} key={`h-${index}`}>{children}</h2>
        : level === 2 ? <h3 id={id} key={`h-${index}`}><span>{sectionNumber ? sectionNumber.padStart(2, '0') : '§'}</span>{children}</h3>
          : <h4 id={id} key={`h-${index}`}>{children}</h4>);
      index += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const rows = tableLines.map((row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
      const hasHeader = rows.length > 1 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
      const bodyRows = hasHeader ? rows.slice(2) : rows;
      blocks.push(
        <div className="research-table-wrap" key={`table-${index}`}><table>
          {hasHeader ? <thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `th-${index}-${cellIndex}`, sources)}</th>)}</tr></thead> : null}
          <tbody>{bodyRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, `td-${index}-${rowIndex}-${cellIndex}`, sources)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ul-${index}-${itemIndex}`, sources)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `ol-${index}-${itemIndex}`, sources)}</li>)}</ol>);
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join(' '), `quote-${index}`, sources)}</blockquote>);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(' '), `p-${index}`, sources)}</p>);
  }

  return <article className="research-document">{blocks}</article>;
}

export default function ResearchDocumentView({ content, sources }: { content: string; sources: ResearchSource[] }) {
  const signals = getResearchSignals(content, sources);
  const mapHeadings = signals.headings.filter((heading) => heading.level === 2).slice(0, 12);
  return (
    <>
      {mapHeadings.length ? <nav className="research-document-map" aria-label="Research document sections"><span>Sections</span>{mapHeadings.map((heading) => <a href={`#${heading.id}`} key={heading.id}>{heading.title.replace(/^\d+[.)]?\s*/, '')}</a>)}</nav> : null}
      <ResearchDocument content={content} sources={sources} />
    </>
  );
}