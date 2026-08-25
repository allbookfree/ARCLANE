import type { Metadata } from 'next';
import Link from 'next/link';
import { studioStages } from './_lib/stages';

export const metadata: Metadata = {
  title: 'Creator Studio — Arclane',
  description: 'A connected AI production workflow for the Global Everyday History channel.',
};

export default function StudioPage() {
  return (
    <main className="studio-entry">
      <header className="studio-entry-header">
        <Link className="studio-entry-brand" href="/"><span>A</span><strong>ARCLANE</strong></Link>
        <Link href="/">Back to website ↗</Link>
      </header>
      <section className="studio-entry-hero">
        <p>Creator Studio / Connected production system</p>
        <h1>One story system.<br />Idea to upload.</h1>
        <span>Choose an idea once. Every approved output becomes the factual and creative context for the next AI stage.</span>
        <Link className="studio-start" href="/studio/ideas"><span>Start the workflow</span><strong>Ideas →</strong></Link>
      </section>
      <section className="studio-entry-sequence" aria-label="Production stages">
        {studioStages.map((stage) => (
          <Link href={`/studio/${stage.id}`} key={stage.id}><span>{stage.number}</span><strong>{stage.title}</strong><small>{stage.eyebrow}</small></Link>
        ))}
      </section>
    </main>
  );
}
