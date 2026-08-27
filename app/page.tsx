'use client';

import { useState } from 'react';
import Link from 'next/link';
import './home.css';

const stageDemos = [
  {
    num: '01',
    id: 'ideas',
    tab: '01 Ideas',
    badge: '01 / IDEAS DISCOVERY & MEMORY',
    title: 'High-Curiosity Topic Discovery',
    content:
      '“The Roman Baker’s Dawn: How an Empire Survived on 200,000 Free Daily Loaves”\n• Angle: Daily life, slave-run grain mills, and volcanic Pompeii bakery excavations.\n• Anti-Duplication Memory: Verified unique across 48 preserved channel records.',
  },
  {
    num: '02',
    id: 'research',
    tab: '02 Research',
    badge: '02 / EVIDENCE-LOCKED RESEARCH',
    title: 'Verified Primary Sources & Timeline',
    content:
      '• Source 1: Pliny the Elder (Naturalis Historia XVIII) — Grain types & mill mechanics.\n• Source 2: Pompeii Bakery of Popidius Priscus (Excavation ID: VII.2.22).\n• Verification Score: 98% factual confidence. Zero hallucinated historical events.',
  },
  {
    num: '03',
    id: 'script',
    tab: '03 Script',
    badge: '03 / 4-ACT DOCUMENTARY SCRIPT',
    title: 'Cinematic High-Retention Narrative',
    content:
      'Act I (00:00–02:15): “At three in the morning, long before the Emperor stirred, Rome was already burning.”\nAct II: The Annona Egyptian grain fleet.\nAct III: The Baker’s Guild rebellion.\nAct IV: The carbonized loaf surviving 2,000 years in ash.',
  },
  {
    num: '04',
    id: 'voiceover',
    tab: '04 Voiceover',
    badge: '04 / VOICEOVER CADENCE DIRECTION',
    title: 'Pacing, Pauses & Emotion Delivery',
    content:
      '• Voice Profile: Calm, authoritative British Baritone (136 WPM).\n• Delivery Direction: “At three in the morning... [pause: 1.2s] long before the Emperor stirred... [tone: hushed gravity] Rome was already awake.”',
  },
  {
    num: '05',
    id: 'visuals',
    tab: '05 Visuals',
    badge: '05 / DIALOGUE-MATCHED PROMPTS',
    title: 'Frame-by-Frame AI Visual Prompts',
    content:
      'Shot 01 (00:00–00:06): “Cinematic wide shot, dawn light cutting through stone arches of ancient Roman bakery, flour dust hanging in morning air, glowing charcoal oven embers, 35mm documentary photography, 16:9 --ar 16:9 --style raw”',
  },
  {
    num: '06',
    id: 'audio',
    tab: '06 Audio',
    badge: '06 / AMBIENCE & FOLEY SOUND DESIGN',
    title: 'Faith-Safe & Copyright-Clean Audio',
    content:
      '• 00:00–00:15: Heavy volcanic millstone grinding loop (Practical Foley, -14 dB).\n• 00:15–00:45: Deep low-frequency atmospheric room tone (No musical instruments).\n• Safety Mode: 100% Faith-Safe & Copyright-Safe.',
  },
  {
    num: '07',
    id: 'thumbnails',
    tab: '07 Thumbnails',
    badge: '07 / HIGH-CTR THUMBNAIL PACKAGING',
    title: '3 Distinct Psychological Angles',
    content:
      '• Concept A (Curiosity): Volcanic ash loaf split open with gold coin inside (“THE BREAD SECRET”).\n• Concept B (Conflict): Roman baker standing defiant before praetorian guard.\n• Packaging: High subject contrast, 82+ predicted click score.',
  },
  {
    num: '08',
    id: 'description',
    tab: '08 Description',
    badge: '08 / SEO & PUBLISHING PACKAGE',
    title: 'Ranked Titles, Chapters & Description',
    content:
      '• Final Title: The Hidden Daily Life of an Ancient Roman Baker\n• Chapters: 00:00 The 3 AM Mill / 02:40 The Grain Conspiracy / 06:15 Pompeii Ash\n• Includes: Ranked search tags, pinned creator comment, and reference citations.',
  },
  {
    num: '09',
    id: 'shorts',
    tab: '09 Shorts',
    badge: '09 / VERTICAL SHORTS ENGINE',
    title: 'Standalone 9:16 Viral Repurposing',
    content:
      '• Short 01: “The Secret Baker’s Stamp of Pompeii (9:16 Vertical Story)”\n• Hook: “Every single loaf of bread in ancient Rome was stamped with a secret code.”\n• Link: Auto-linked to full documentary as YouTube Related Video.',
  },
];

const faqs = [
  {
    q: 'What is Arclane Creator Studio?',
    a: 'Arclane is a comprehensive, connected 9-stage creative intelligence platform engineered specifically for autonomous faceless YouTube channels and documentary creators. It replaces dozens of disconnected AI tools with one continuous, fact-grounded workflow from topic discovery to publish-ready assets.',
  },
  {
    q: 'How does the connected 9-stage pipeline work?',
    a: 'Unlike generic AI tools where you must prompt from scratch each time, Arclane automatically passes the verified factual context, approved script, and artistic direction from each stage directly into the next (Ideas → Research → Script → Voiceover → Visuals → Audio → Thumbnails → Description → Shorts).',
  },
  {
    q: 'Can I manage multiple channels or different niches?',
    a: 'Yes. Arclane is architected as a Multi-Channel Studio Fleet. You can run and switch between independent channel studios (e.g., Everyday History, Unsolved Mysteries, Nature & Science), each with its own locked audience tone, memory history, and stage pipeline.',
  },
  {
    q: 'Are my scripts, ideas, and API keys private?',
    a: '100% private. Arclane uses a zero-server-storage client architecture. All your drafts, ideas, channel memories, and custom API provider configurations remain strictly stored on your own local device.',
  },
  {
    q: 'What are the Faith-Safe and Modesty production modes?',
    a: 'For creators producing ethical or faith-safe content, Arclane includes built-in toggles that restrict background audio to realistic ambience and practical Foley (no musical instruments) and automatically formats visual generation prompts to respect modest historical attire.',
  },
];

export default function Home() {
  const [activeStage, setActiveStage] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const demo = stageDemos[activeStage];

  return (
    <main className="home-shell">
      {/* Top Navbar */}
      <header className="home-header">
        <a className="home-brand" href="#top" aria-label="Arclane Home">
          <span className="home-brand-mark">A</span>
          <span className="home-brand-name">ARCLANE</span>
        </a>

        <nav className="home-nav" aria-label="Main Navigation">
          <a href="#how-it-works">How it Works</a>
          <a href="#pipeline">The 9 Stages</a>
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
          <Link href="/studio">Channel Hub</Link>
        </nav>

        <Link className="home-cta-btn" href="/studio">
          <span>Launch Studio</span>
          <i>→</i>
        </Link>
      </header>

      {/* Hero Section */}
      <section className="home-hero" id="top">
        <div className="home-hero-bg" aria-hidden="true" />

        <div className="home-hero-content">
          <div className="home-pill">
            <span /> Autonomous YouTube Documentary Studio
          </div>

          <h1>
            Autonomous Production.<br />
            <em>From Idea to Upload.</em>
          </h1>

          <p>
            Arclane is the connected 9-stage creative intelligence platform built for high-retention
            faceless documentary YouTube channels. Research-grounded, fact-locked, and production-ready.
          </p>

          <div className="home-hero-actions">
            <Link className="btn-primary" href="/studio">
              <span>Launch Creator Studio</span>
              <i>→</i>
            </Link>
            <a className="btn-secondary" href="#pipeline-preview">
              <span>Explore Interactive Pipeline</span>
              <i>↓</i>
            </a>
          </div>
        </div>

        {/* Live Studio Pipeline Simulator */}
        <div className="hero-mockup" id="pipeline-preview" aria-label="Interactive Studio Pipeline Simulator">
          <div className="mockup-topbar">
            <div className="mockup-dots">
              <span /><span /><span />
            </div>
            <div className="mockup-title">Connected Production Engine · Click any stage to test</div>
            <div className="mockup-status">
              <i /> Live System Preview
            </div>
          </div>

          <div className="mockup-pipeline-flow">
            {stageDemos.map((s, idx) => (
              <button
                type="button"
                className={`mockup-stage-step ${idx === activeStage ? 'active' : ''}`}
                key={s.id}
                onClick={() => setActiveStage(idx)}
              >
                <span>{s.num} / STAGE</span>
                <strong>{s.tab.replace(/^\d+\s*/, '')}</strong>
              </button>
            ))}
          </div>

          <div className="mockup-preview-card">
            <div className="preview-card-header">
              <span className="preview-badge">{demo.badge}</span>
              <span className="preview-channel-pill">Channel: Global Everyday History</span>
            </div>
            <div className="preview-card-title">{demo.title}</div>
            <pre className="preview-card-content">{demo.content}</pre>
          </div>
        </div>
      </section>

      {/* How It Works 3-Step Section */}
      <section className="home-section" id="how-it-works">
        <div className="section-head">
          <span className="section-tag">Simple 3-Step Workflow</span>
          <h2>How Arclane Works</h2>
          <p>
            Produce complete, broadcast-quality documentary episodes without switching between twenty disconnected tools.
          </p>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01</span>
            <h3>Discover &amp; Lock Angle</h3>
            <p>
              AI discovers high-curiosity documentary angles automatically protected by long-term channel memory so your channel never repeats a story.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">02</span>
            <h3>Run Connected Production</h3>
            <p>
              Each approved stage automatically injects verified factual research and tone context into the 4-act script, voiceover timings, and visual prompts.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">03</span>
            <h3>One-Click Export &amp; Publish</h3>
            <p>
              Export formatted dialogue prompts for Midjourney, audio cues for CapCut/Premiere, and complete SEO titles, timestamps, and Shorts.
            </p>
          </article>
        </div>
      </section>

      {/* The 9 Stages Grid */}
      <section className="home-section" id="pipeline">
        <div className="section-head">
          <span className="section-tag">Complete System</span>
          <h2>The 9-Stage Connected Pipeline</h2>
          <p>
            Every stage outputs verified context directly into the next, eliminating creative drift and repetitive prompting.
          </p>
        </div>

        <div className="pipeline-grid">
          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">01</span>
              <span className="pipeline-tag">Topic Strategy</span>
            </div>
            <h3>Idea Discovery &amp; Memory</h3>
            <p>
              Discover high-curiosity documentary angles protected by long-term channel memory to permanently prevent topic duplication.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">02</span>
              <span className="pipeline-tag">Fact Grounding</span>
            </div>
            <h3>Evidence-Locked Research</h3>
            <p>
              Conduct verified historical research with primary source citations, timeline accuracy, and structured evidence cards.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">03</span>
              <span className="pipeline-tag">Story Engine</span>
            </div>
            <h3>4-Act Documentary Script</h3>
            <p>
              Generate high-retention narration structured for emotional hook, dramatic exposition, midpoint tension, and satisfying resolution.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">04</span>
              <span className="pipeline-tag">Voice &amp; Pacing</span>
            </div>
            <h3>Voiceover Direction</h3>
            <p>
              Automate pronunciation keys, sentence timing, emotional pitch, and delivery pauses tailored for natural TTS or voice artists.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">05</span>
              <span className="pipeline-tag">Visual Pipeline</span>
            </div>
            <h3>Dialogue-Matched Prompts</h3>
            <p>
              Generate cinematic AI visual prompts mapped frame-by-frame to spoken dialogue with locked aesthetic styles and aspect ratios.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">06</span>
              <span className="pipeline-tag">Audio Design</span>
            </div>
            <h3>Ambience &amp; Foley Design</h3>
            <p>
              Build faith-safe and copyright-clean soundscapes with practical Foley effects, ambient drones, and precise timing values.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">07</span>
              <span className="pipeline-tag">Packaging</span>
            </div>
            <h3>High-CTR Thumbnails</h3>
            <p>
              Develop 3 distinct visual concepts engineered for high click-through contrast, emotional tension, and clear subject hierarchy.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">08</span>
              <span className="pipeline-tag">Metadata</span>
            </div>
            <h3>SEO &amp; Publishing Package</h3>
            <p>
              Export algorithm-optimized titles, search descriptions, timestamps, chapters, pinned comments, and tags in one click.
            </p>
          </article>

          <article className="pipeline-card">
            <div className="pipeline-card-top">
              <span className="pipeline-num">09</span>
              <span className="pipeline-tag">Repurposing</span>
            </div>
            <h3>Vertical Shorts Engine</h3>
            <p>
              Extract standalone 9:16 vertical stories from the long documentary with dialogue-matched captions, visuals, and related video links.
            </p>
          </article>
        </div>
      </section>

      {/* Core Technical Pillars */}
      <section className="home-section" id="features">
        <div className="section-head">
          <span className="section-tag">Engineering</span>
          <h2>Built for Serious Channel Automation</h2>
          <p>
            Designed specifically for creators running scalable faceless channels without sacrificing factual accuracy or production speed.
          </p>
        </div>

        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>0ms Instant SPA Engine</h3>
            <p>
              Experience instantaneous navigation across all stages with zero server roundtrips, eliminating white screens and page reloads.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>100% Private Local Storage</h3>
            <p>
              All workflow state, generated scripts, channel memory, and API provider credentials stay securely encrypted on your local device.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Faith-Safe &amp; Modesty Modes</h3>
            <p>
              Built-in production toggles allow full music-free sound design, modest visual generation rules, and ethical historical grounding.
            </p>
          </article>

          <article className="feature-card">
            <div className="feature-icon">🌐</div>
            <h3>Multi-Channel Fleet Hub</h3>
            <p>
              Seamlessly manage multiple independent YouTube channels and niche systems from a single unified creator command center.
            </p>
          </article>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="home-section" id="faq">
        <div className="section-head">
          <span className="section-tag">Frequently Asked Questions</span>
          <h2>Questions &amp; Answers</h2>
          <p>Everything you need to know about Arclane Creator Studio and the production engine.</p>
        </div>

        <div className="faq-list">
          {faqs.map((faq, idx) => (
            <div className={`faq-item ${openFaq === idx ? 'active' : ''}`} key={faq.q}>
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              >
                <span>{faq.q}</span>
                <span className="faq-icon">＋</span>
              </button>
              {openFaq === idx && <p className="faq-answer">{faq.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="home-cta-section">
        <div className="home-cta-box">
          <h2>Ready to build your faceless documentary empire?</h2>
          <p>
            Enter your channel studio and run the complete 9-stage connected production pipeline today.
          </p>
          <Link className="btn-primary" href="/studio">
            <span>Launch Creator Studio</span>
            <i>→</i>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-brand">
          <span className="home-brand-mark">A</span>
          <span>ARCLANE CREATOR STUDIO</span>
        </div>

        <div className="home-footer-links">
          <a href="#how-it-works">How it Works</a>
          <a href="#pipeline">The 9 Stages</a>
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
          <Link href="/studio">Channel Hub</Link>
          <a href="#top">Back to top ↑</a>
        </div>

        <div>
          <span>© 2026 Arclane · Autonomous Faceless Studio Engine</span>
        </div>
      </footer>
    </main>
  );
}


