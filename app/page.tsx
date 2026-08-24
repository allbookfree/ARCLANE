const ArrowUpRight = () => <span aria-hidden="true">↗</span>;

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Arclane home">
          <span className="brand-mark" aria-hidden="true" />
          <span>ARCLANE</span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#expertise">Expertise</a>
          <a href="#work">Selected work</a>
          <a href="#approach">Approach</a>
          <a href="#about">About</a>
        </nav>

        <a className="header-cta" href="#contact">
          Let&apos;s talk <ArrowUpRight />
        </a>

        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <nav aria-label="Mobile navigation">
            <a href="#expertise">Expertise</a>
            <a href="#work">Selected work</a>
            <a href="#approach">Approach</a>
            <a href="#about">About</a>
            <a href="#contact">Start a project</a>
          </nav>
        </details>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> Independent digital studio — Dhaka / Worldwide
          </p>
          <h1>
            Digital experiences
            <br />
            built to <em>lead.</em>
          </h1>
          <p className="hero-intro">
            We help ambitious companies turn complex ideas into clear,
            high-performing digital products and brands.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="#contact">
              Start a project <ArrowUpRight />
            </a>
            <a className="text-link" href="#work">
              Explore our work <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className="hero-proof" aria-label="Company highlights">
            <div>
              <strong>12+</strong>
              <span>Markets reached</span>
            </div>
            <div>
              <strong>38</strong>
              <span>Products launched</span>
            </div>
            <div>
              <strong>96%</strong>
              <span>Partner retention</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Arclane digital experience preview">
          <div className="visual-topline">
            <span>Strategy / Design / Technology</span>
            <span>©26</span>
          </div>
          <div className="orbital-system" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit orbit-three" />
            <span className="orbit-core">A</span>
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
          </div>
          <div className="visual-footer">
            <div>
              <span>Current focus</span>
              <strong>Intelligent digital systems</strong>
            </div>
            <span className="visual-index">01</span>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Selected partners">
        <p>Trusted by teams building what&apos;s next</p>
        <div>
          <span>WAVELINE</span>
          <span>MONUMENT</span>
          <span>POLARIS</span>
          <span>NORTH &amp; CO.</span>
          <span>STUDIO/88</span>
        </div>
      </section>

      <section className="manifesto section-pad" id="about">
        <div className="section-kicker">What we believe</div>
        <div className="manifesto-copy">
          <p className="manifesto-lead">
            Good design earns attention.
            <br />
            <em>Great design earns trust.</em>
          </p>
          <div className="manifesto-detail">
            <p>
              We work where brand, product, and technology meet—creating
              digital systems that feel clear to people and valuable to
              businesses.
            </p>
            <a className="underlined-link" href="#approach">
              Discover our approach <ArrowUpRight />
            </a>
          </div>
        </div>
      </section>

      <section className="expertise section-pad" id="expertise">
        <div className="section-heading">
          <div>
            <p className="section-kicker light">Capabilities</p>
            <h2>From first idea to lasting impact.</h2>
          </div>
          <p>
            A senior, integrated team across strategy, design, and
            engineering—assembled around the outcome you need.
          </p>
        </div>

        <div className="service-list">
          <article>
            <span className="service-number">01</span>
            <h3>Strategy &amp; positioning</h3>
            <p>Research, product strategy, brand positioning, and digital roadmaps.</p>
            <span className="service-arrow" aria-hidden="true">↗</span>
          </article>
          <article>
            <span className="service-number">02</span>
            <h3>Brand systems</h3>
            <p>Identity, verbal direction, visual systems, and launch toolkits.</p>
            <span className="service-arrow" aria-hidden="true">↗</span>
          </article>
          <article>
            <span className="service-number">03</span>
            <h3>Digital products</h3>
            <p>Websites, platforms, SaaS products, and intelligent interfaces.</p>
            <span className="service-arrow" aria-hidden="true">↗</span>
          </article>
          <article>
            <span className="service-number">04</span>
            <h3>Technology</h3>
            <p>Full-stack engineering, design systems, optimization, and scale.</p>
            <span className="service-arrow" aria-hidden="true">↗</span>
          </article>
        </div>
      </section>

      <section className="work section-pad" id="work">
        <div className="section-heading work-heading">
          <div>
            <p className="section-kicker">Selected work</p>
            <h2>Work that moves business forward.</h2>
          </div>
          <a className="underlined-link" href="#contact">
            Discuss your project <ArrowUpRight />
          </a>
        </div>

        <div className="projects">
          <article className="project project-large">
            <div className="project-art project-art-aster" aria-hidden="true">
              <div className="aster-panel">
                <span>ASTER / PRIVATE CAPITAL</span>
                <strong>Clarity for every financial decision.</strong>
                <i>Explore the portfolio ↗</i>
              </div>
              <div className="aster-orb" />
            </div>
            <div className="project-meta">
              <div>
                <h3>Aster Finance</h3>
                <p>Digital flagship for a new generation of private wealth</p>
              </div>
              <span>Strategy · Brand · Product · Build</span>
            </div>
          </article>

          <article className="project">
            <div className="project-art project-art-calia" aria-hidden="true">
              <div className="calia-word">calia</div>
              <div className="calia-card">
                <span>Today&apos;s readiness</span>
                <strong>92</strong>
                <i>Rested &amp; ready</i>
              </div>
              <div className="calia-pulse">● ● ● ● ●</div>
            </div>
            <div className="project-meta">
              <div>
                <h3>Calia Health</h3>
                <p>A calmer, more human everyday health platform</p>
              </div>
              <span>Product · Experience · Build</span>
            </div>
          </article>

          <article className="project">
            <div className="project-art project-art-north" aria-hidden="true">
              <div className="north-label">NORTHLINE</div>
              <div className="north-copy">
                <span>68° 13&apos; N</span>
                <strong>Energy for a changing world.</strong>
              </div>
              <div className="north-sun" />
            </div>
            <div className="project-meta">
              <div>
                <h3>Northline Energy</h3>
                <p>Reframing an energy company around progress</p>
              </div>
              <span>Positioning · Identity · Digital</span>
            </div>
          </article>
        </div>
      </section>

      <section className="approach section-pad" id="approach">
        <div className="approach-intro">
          <p className="section-kicker light">How we work</p>
          <h2>Senior thinking.<br />Simple process.<br /><em>Zero theatre.</em></h2>
          <p>
            You work directly with the people doing the work. Small teams,
            clear decisions, and momentum you can feel every week.
          </p>
        </div>

        <div className="process-list">
          <article>
            <span>01 / Align</span>
            <h3>Find the sharpest version of the problem.</h3>
            <p>We align on ambition, audience, constraints, and the decisions that matter most.</p>
          </article>
          <article>
            <span>02 / Create</span>
            <h3>Turn strategy into a system people can feel.</h3>
            <p>Ideas become tangible early—tested, refined, and built together in the open.</p>
          </article>
          <article>
            <span>03 / Advance</span>
            <h3>Launch well, learn quickly, keep improving.</h3>
            <p>We ship with confidence, measure what matters, and help your team build forward.</p>
          </article>
        </div>
      </section>

      <section className="outcomes section-pad">
        <div className="quote-mark" aria-hidden="true">“</div>
        <blockquote>
          Arclane brought rare clarity to a complicated brief. The result was
          not just a better product—it changed how our team sees the business.
        </blockquote>
        <p className="quote-credit"><strong>Leah Morgan</strong> / Chief Growth Officer, Aster</p>

        <div className="outcome-stats">
          <div><strong>2.8×</strong><span>Average conversion uplift</span></div>
          <div><strong>34%</strong><span>Faster time to market</span></div>
          <div><strong>4.9/5</strong><span>Partner experience score</span></div>
          <div><strong>7 yrs</strong><span>Average team experience</span></div>
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-orbit" aria-hidden="true">
          <span />
          <i />
        </div>
        <p className="section-kicker light">Have a meaningful challenge?</p>
        <h2>Let&apos;s build what&apos;s next.</h2>
        <a className="button button-light" href="mailto:hello@arclane.studio">
          hello@arclane.studio <ArrowUpRight />
        </a>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <a className="brand brand-light" href="#top">
            <span className="brand-mark" aria-hidden="true" /> ARCLANE
          </a>
          <p>Independent digital studio.<br />Dhaka / Working worldwide.</p>
        </div>
        <div className="footer-links">
          <div>
            <span>Navigate</span>
            <a href="#expertise">Expertise</a>
            <a href="#work">Selected work</a>
            <a href="#approach">Approach</a>
          </div>
          <div>
            <span>Connect</span>
            <a href="mailto:hello@arclane.studio">Email</a>
            <a href="#top">LinkedIn</a>
            <a href="#top">Instagram</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Arclane Studio</span>
          <span>Designed with intention. Built for speed.</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </main>
  );
}
