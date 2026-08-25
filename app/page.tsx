const Arrow = () => <span aria-hidden="true">↗</span>;

const serviceItems = [
  {
    number: '01',
    label: 'Clarity',
    title: 'Know what to make next.',
    description:
      'A clear channel position, audience promise, content pillars, and a practical 90-day plan.',
    outcome: 'Channel strategy',
  },
  {
    number: '02',
    label: 'Clicks',
    title: 'Make the right people curious.',
    description:
      'Repeatable title and thumbnail systems that earn attention without losing your voice.',
    outcome: 'Packaging system',
  },
  {
    number: '03',
    label: 'Retention',
    title: 'Give viewers a reason to stay.',
    description:
      'Stronger formats, story structure, pacing, and creative direction for more watchable videos.',
    outcome: 'Content direction',
  },
  {
    number: '04',
    label: 'Business',
    title: 'Build beyond the next upload.',
    description:
      'A smarter path to partnerships, products, and revenue that fits the audience you are building.',
    outcome: 'Creator growth',
  },
];

const cases = [
  {
    className: 'case-deep-dive',
    category: 'Documentary creator',
    name: 'The Deep Dive',
    challenge: 'Great stories. Inconsistent views.',
    result: '2.6× returning viewers',
    services: 'Strategy · Series · Packaging',
  },
  {
    className: 'case-maya',
    category: 'Lifestyle creator',
    name: 'Maya After Hours',
    challenge: 'A loyal audience without a clear brand.',
    result: '+41% repeat audience',
    services: 'Positioning · Identity · Growth',
  },
  {
    className: 'case-fieldcraft',
    category: 'Maker educator',
    name: 'Fieldcraft',
    challenge: 'Strong ideas. No repeatable format.',
    result: '3.1× upload consistency',
    services: 'Formats · Workflow · Audience',
  },
];

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Arclane home">
          <span className="brand-mark" aria-hidden="true" />
          <span>ARCLANE</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#services">What we solve</a>
          <a href="#work">Creator results</a>
          <a href="#process">How it works</a>
          <a href="#about">Why Arclane</a>
        </nav>

        <a className="header-cta" href="/studio">
          Open creator studio <Arrow />
        </a>

        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile navigation">
            <a href="#services">What we solve</a>
            <a href="#work">Creator results</a>
            <a href="#process">How it works</a>
            <a href="#about">Why Arclane</a>
            <a href="/studio">Open creator studio</a>
          </nav>
        </details>
      </header>

      <section className="creator-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> Strategy and creative systems for YouTubers
          </p>
          <h1>
            Make better content.
            <br />
            Grow a <em>stronger channel.</em>
          </h1>
          <p className="hero-intro">
            Arclane gives ambitious creators a clear plan for what to make,
            how to package it, and what to improve—without the guesswork.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="/studio">
              Open creator studio <Arrow />
            </a>
            <a className="text-link" href="#process">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className="creator-pill-row" aria-label="Creator services overview">
            <span>Channel strategy</span>
            <span>Content systems</span>
            <span>Packaging &amp; growth</span>
          </div>
        </div>

        <div className="creator-dashboard" aria-label="Creator growth workspace preview">
          <div className="dashboard-topbar">
            <div>
              <span className="dashboard-logo">A</span>
              <strong>Creator workspace</strong>
            </div>
            <span className="live-status"><i /> Strategy active</span>
          </div>

          <div className="channel-overview">
            <div>
              <span className="channel-avatar">YC</span>
              <p><strong>Your channel</strong><span>Weekly creator review</span></p>
            </div>
            <span className="week-label">Week 08</span>
          </div>

          <div className="growth-score">
            <div>
              <span>Channel momentum</span>
              <strong>82</strong>
              <small>Strong and rising</small>
            </div>
            <div className="score-ring" aria-hidden="true"><span>+12</span></div>
          </div>

          <div className="metric-grid" aria-label="Example channel metrics">
            <div><span>Avg. view</span><strong>8:42</strong><small>↑ 18%</small></div>
            <div><span>Click rate</span><strong>7.8%</strong><small>↑ 1.4</small></div>
            <div><span>Returning</span><strong>41%</strong><small>↑ 9%</small></div>
          </div>

          <div className="next-upload">
            <div className="upload-thumb" aria-hidden="true"><span>08:16</span></div>
            <div><span>Next upload</span><strong>The idea your audience keeps asking for</strong></div>
            <span className="ready-badge">Ready</span>
          </div>
        </div>
      </section>

      <section className="creator-strip" aria-label="Creator types we support">
        <p>Made for creators building seriously</p>
        <div>
          <span>Educators</span>
          <span>Storytellers</span>
          <span>Commentators</span>
          <span>Makers</span>
          <span>Experts</span>
        </div>
      </section>

      <section className="clarity-section section-pad" id="about">
        <p className="section-kicker">The creator problem</p>
        <div className="clarity-layout">
          <h2>
            You don&apos;t need more content advice.
            <br />
            <em>You need a clear system.</em>
          </h2>
          <div className="clarity-copy">
            <p>
              Arclane turns scattered ideas, confusing analytics, and big
              ambition into one practical direction your channel can actually
              follow.
            </p>
            <a className="inline-link" href="#services">
              See what we solve <Arrow />
            </a>
          </div>
        </div>

        <div className="clarity-points">
          <article>
            <span>01</span>
            <strong>Know what to make</strong>
            <p>A focused content direction instead of an endless idea list.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Know why it works</strong>
            <p>Simple audience signals you can understand and use.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Know what to improve</strong>
            <p>One useful next move after every upload—not twenty.</p>
          </article>
        </div>
      </section>

      <section className="services section-pad" id="services">
        <div className="section-heading light-heading">
          <div>
            <p className="section-kicker light">What we solve</p>
            <h2>Everything your channel needs to move forward.</h2>
          </div>
          <p>
            No bloated agency team. No generic playbook. Just focused help
            around the creator problem holding you back right now.
          </p>
        </div>

        <div className="service-grid">
          {serviceItems.map((item) => (
            <article key={item.number}>
              <div className="service-topline">
                <span>{item.number}</span>
                <span>{item.label}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="service-outcome">
                <span>{item.outcome}</span>
                <Arrow />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="work section-pad" id="work">
        <div className="section-heading work-heading">
          <div>
            <p className="section-kicker">Creator results</p>
            <h2>Real channel problems. Clear creator outcomes.</h2>
          </div>
          <a className="inline-link" href="#contact">
            Talk about your channel <Arrow />
          </a>
        </div>

        <div className="case-grid">
          {cases.map((item, index) => (
            <article className={`case-card ${index === 0 ? 'case-featured' : ''}`} key={item.name}>
              <div className={`case-art ${item.className}`} aria-hidden="true">
                <div className="case-browserbar"><i /><i /><i /><span>Creator channel</span></div>
                <div className="case-thumbnail">
                  <span className="case-category">{item.category}</span>
                  <strong>{item.challenge}</strong>
                  <span className="play-mark">▶</span>
                  <small>{index === 0 ? '14:28' : index === 1 ? '09:42' : '12:06'}</small>
                </div>
                <div className="case-video-meta">
                  <span className="mini-avatar">{item.name.slice(0, 1)}</span>
                  <div><b>{item.name}</b><span>New creator system in action</span></div>
                  <span>•••</span>
                </div>
              </div>
              <div className="case-meta">
                <div>
                  <span>{item.category}</span>
                  <h3>{item.name}</h3>
                  <p>{item.challenge}</p>
                </div>
                <div>
                  <strong>{item.result}</strong>
                  <span>{item.services}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="process section-pad" id="process">
        <div className="process-heading">
          <p className="section-kicker">How it works</p>
          <h2>Three simple steps.<br /><em>One clearer channel.</em></h2>
          <p>You stay the creator. We make the next move easier to see.</p>
        </div>

        <div className="process-steps">
          <article>
            <span className="step-number">01</span>
            <div className="step-icon" aria-hidden="true">◎</div>
            <h3>Share your channel</h3>
            <p>We look at your content, audience, goals, and where growth feels stuck.</p>
            <small>Channel review</small>
          </article>
          <article>
            <span className="step-number">02</span>
            <div className="step-icon" aria-hidden="true">✦</div>
            <h3>Get a focused plan</h3>
            <p>You get a clear strategy for content, packaging, and the next 90 days.</p>
            <small>Creator roadmap</small>
          </article>
          <article>
            <span className="step-number">03</span>
            <div className="step-icon" aria-hidden="true">↗</div>
            <h3>Build with clarity</h3>
            <p>We work alongside you to make, measure, and improve without losing your voice.</p>
            <small>Weekly momentum</small>
          </article>
        </div>
      </section>

      <section className="results section-pad">
        <div className="result-quote">
          <span className="quote-mark" aria-hidden="true">“</span>
          <blockquote>
            They didn&apos;t change what made my channel mine. They made every
            decision easier—and the audience felt the difference.
          </blockquote>
          <p><strong>Maya Rahman</strong><span>Creator, Maya After Hours</span></p>
        </div>

        <div className="result-stats" aria-label="Example creator outcomes">
          <div><strong>3.4×</strong><span>Average view growth</span></div>
          <div><strong>+41%</strong><span>Returning viewers</span></div>
          <div><strong>68%</strong><span>Average retention</span></div>
          <div><strong>4.9/5</strong><span>Creator experience</span></div>
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-copy">
          <p className="section-kicker light">Your clearest next move starts here</p>
          <h2>One channel.<br />One clear plan.</h2>
          <p>
            Tell us what feels stuck. We&apos;ll help you see what to fix first.
          </p>
          <a className="button button-light" href="/studio">
            Open creator studio <Arrow />
          </a>
        </div>
        <div className="contact-card" aria-label="Channel review summary">
          <div className="contact-card-top"><span>Arclane channel review</span><span>01 / Start</span></div>
          <div className="review-orbit" aria-hidden="true"><span>A</span></div>
          <div className="review-list">
            <div><span>01</span><strong>Your channel now</strong><i>Included</i></div>
            <div><span>02</span><strong>Your clearest opportunity</strong><i>Included</i></div>
            <div><span>03</span><strong>Your next best move</strong><i>Included</i></div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <a className="brand brand-light" href="#top">
              <span className="brand-mark" aria-hidden="true" /> ARCLANE
            </a>
            <p>Clear strategy for creators<br />building something that lasts.</p>
          </div>
          <div className="footer-links">
            <div>
              <span>Explore</span>
              <a href="#services">What we solve</a>
              <a href="#work">Creator results</a>
              <a href="#process">How it works</a>
            </div>
            <div>
              <span>Start</span>
              <a href="mailto:hello@arclane.studio">Email Arclane</a>
              <a href="/studio">Creator Studio</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Arclane Creator Studio</span>
          <span>Dhaka / Working worldwide</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </main>
  );
}
