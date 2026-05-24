/**
 * Landing page (`/`) — the editorial cover for Kin.
 *
 * Mirrors the product's "Watchful ember" design language. The product lives
 * at `/app`; every CTA on this page eventually points there.
 *
 * Motion system (see globals.css):
 *   • word-by-word blur-rise on the hero headline
 *   • scroll-triggered reveals via <Reveal> client component
 *   • breathing float on the mock card
 *   • drifting ember sheen on the primary mock action
 *   • traced ember hairline across the loop steps
 *   • concentric rings radiating from the brand eye
 */

import Link from "next/link";
import { Reveal } from "./components/Reveal";

export default function Landing() {
  return (
    <main className="kin-page-in relative min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-24 sm:pt-12">
        {/* ── 1. Header ─────────────────────────────────────────────── */}
        <header className="kin-rise flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Kin home">
            <span className="kin-eye-aura">
              <span className="kin-eye" aria-hidden="true" />
            </span>
            <span
              className="text-2xl tracking-tight text-kin-bone italic"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Kin
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <a
              href="#how-it-works"
              className="hidden sm:inline-flex items-center text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft hover:text-kin-bone transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              The loop
            </a>
            <Link
              href="/app"
              className="kin-btn kin-btn-primary"
              aria-label="Open the Kin app"
            >
              Open the app
              <ArrowRight />
            </Link>
          </nav>
        </header>

        {/* ── 2. Hero ───────────────────────────────────────────────── */}
        <section
          className="mt-20 sm:mt-28 max-w-3xl"
          aria-label="Introducing Kin"
        >
          <p
            className="kin-rise text-[11px] uppercase tracking-[0.28em] text-kin-bone-soft"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Household financial guardian
          </p>

          <h1
            className="mt-6 text-[44px] sm:text-[80px] leading-[1.02] tracking-tight text-kin-bone text-pretty"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <StaggeredWords words={["Money", "you", "don\u2019t", "have", "to"]} startDelay={160} />
            <br />
            <StaggeredWords
              words={["watch."]}
              startDelay={160 + 5 * 110}
              accent
            />
          </h1>

          <Reveal delay={160 + 6 * 110}>
            <p className="mt-7 max-w-xl text-lg sm:text-xl leading-relaxed text-kin-bone-mute text-pretty">
              Sees across every account. Acts before money problems happen.{" "}
              <span className="text-kin-bone">Quiet until it matters.</span>
            </p>
          </Reveal>

          <Reveal delay={160 + 6 * 110 + 140}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="kin-btn kin-btn-primary"
                aria-label="Open the Kin app"
              >
                See it live
                <ArrowRight />
              </Link>
              <a href="#how-it-works" className="kin-btn kin-btn-ghost">
                How it works
              </a>
            </div>
          </Reveal>
        </section>

        {/* ── 3. Quiet metric strip ─────────────────────────────────── */}
        <Reveal delay={160 + 6 * 110 + 280}>
          <div
            className="mt-16 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-kin-bone-soft"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-kin-good kin-pulse"
                aria-hidden="true"
              />
              Watching
            </span>
            <span aria-hidden="true" className="text-kin-bone-dim">·</span>
            <span>4 sources</span>
            <span aria-hidden="true" className="text-kin-bone-dim">·</span>
            <span className="tabular-nums">1,397 silent</span>
            <span aria-hidden="true" className="text-kin-bone-dim">·</span>
            <span className="text-kin-ember-soft">3 pings</span>
          </div>
        </Reveal>

        <div className="kin-hr mt-8" aria-hidden="true" />

        {/* ── 4. Three capabilities ─────────────────────────────────── */}
        <section className="mt-20" aria-label="What Kin does">
          <Reveal>
            <div className="kin-section-eyebrow">
              <span className="kin-section-eyebrow-label">What it does</span>
            </div>
          </Reveal>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Reveal delay={0}>
              <FeatureTile
                eyebrow="Observe"
                title="Every account. One view."
                body="Both partners. Every bank. No silos."
                icon={<EyeMark />}
              />
            </Reveal>
            <Reveal delay={180}>
              <FeatureTile
                eyebrow="Act"
                title="Drafts the fix first."
                body="One tap lands the action."
                icon={<BoltMark />}
              />
            </Reveal>
            <Reveal delay={360}>
              <FeatureTile
                eyebrow="Remember"
                title="Knows your household."
                body="Doesn’t ask twice."
                icon={<MemoryMark />}
              />
            </Reveal>
          </div>
        </section>

        {/* ── 5. The hero moment ────────────────────────────────────── */}
        <section className="mt-24" aria-label="The hero moment" id="hero-moment">
          <Reveal>
            <div className="kin-section-eyebrow">
              <span className="kin-section-eyebrow-label">The hero moment</span>
            </div>
          </Reveal>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.05fr_1fr] items-center">
            <Reveal>
              <div className="max-w-xl">
                <h2
                  className="text-[28px] sm:text-[40px] leading-tight tracking-tight text-kin-bone text-pretty"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Rent autopays Saturday.{" "}
                  <span className="italic text-kin-ember-soft">$450 short.</span>
                </h2>
                <p className="mt-5 text-base sm:text-lg leading-relaxed text-kin-bone-mute text-pretty">
                  Alex fronted the cottage trip. Dana owes $800. Kin already
                  drafted the e-transfer, lined up a backup, and offers to
                  call. <span className="text-kin-bone">One tap lands it.</span>
                </p>
              </div>
            </Reveal>

            <Reveal delay={160} className="kin-reveal-trace rounded-[22px]">
              <div className="kin-float">
                <MockHeroCard />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 6. How it works — the loop ────────────────────────────── */}
        <section className="mt-28" aria-label="How Kin works" id="how-it-works">
          <Reveal>
            <div className="kin-section-eyebrow">
              <span className="kin-section-eyebrow-label">The loop</span>
            </div>
          </Reveal>

          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal delay={0}>
              <Step n="01" title="Observe" body="Reads every account, every tick." />
            </Reveal>
            <Reveal delay={160}>
              <Step n="02" title="Reason" body="Weighs what’s normal vs. what’s breaking." />
            </Reveal>
            <Reveal delay={320}>
              <Step n="03" title="Suggest" body="Surfaces one card with the fix prepared." />
            </Reveal>
            <Reveal delay={480}>
              <Step n="04" title="Act" body="One tap. Done. Written to memory." />
            </Reveal>
          </ol>
        </section>

        {/* ── 7. Final CTA ──────────────────────────────────────────── */}
        <section className="mt-28" aria-label="Open the demo">
          <Reveal className="kin-reveal-trace rounded-[22px]">
            <div className="kin-hero relative px-8 py-12 sm:px-14 sm:py-16">
              <span className="kin-hero-rail" aria-hidden="true" />
              <div className="max-w-2xl">
                <p
                  className="text-[11px] uppercase tracking-[0.28em] text-kin-ember-soft"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Live demo
                </p>
                <h2
                  className="mt-4 text-[36px] sm:text-[56px] leading-[1.05] tracking-tight text-kin-bone text-pretty"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Open it. <span className="italic">Watch it land.</span>
                </h2>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/app"
                    className="kin-btn kin-btn-primary"
                    aria-label="Open the Kin app"
                  >
                    Open the app
                    <ArrowRight />
                  </Link>
                  <span
                    className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-soft"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Runs on the alex &amp; dana seed
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── 8. Footer ─────────────────────────────────────────────── */}
        <footer className="mt-20">
          <div className="kin-hr mb-6" aria-hidden="true" />
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p
              className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-dim"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Built at TechTO · 2026
            </p>
            <p
              className="text-[11px] uppercase tracking-[0.22em] text-kin-bone-dim"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Convex · Backboard · ElevenLabs
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Subcomponents (kept inline so the landing page is self-contained) ───────

/** Word-by-word blur-rise. `accent` styles the words in italic ember. */
function StaggeredWords({
  words,
  startDelay = 0,
  accent = false,
}: {
  words: string[];
  startDelay?: number;
  accent?: boolean;
}) {
  return (
    <>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block">
          <span
            className={"kin-word " + (accent ? "italic text-kin-ember-soft" : "")}
            style={{ animationDelay: `${startDelay + i * 80}ms` }}
          >
            {w}
          </span>
          {i < words.length - 1 ? "\u00A0" : null}
        </span>
      ))}
    </>
  );
}

function FeatureTile({
  eyebrow,
  title,
  body,
  icon,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="kin-feature h-full">
      <div className="kin-feature-icon" aria-hidden="true">
        {icon}
      </div>
      <p
        className="kin-feature-eyebrow"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {eyebrow}
      </p>
      <h3
        className="kin-feature-title"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h3>
      <p className="kin-feature-body">{body}</p>
    </article>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="kin-step kin-step-trace h-full">
      <span
        className="kin-step-n"
        style={{ fontFamily: "var(--font-mono)" }}
        aria-hidden="true"
      >
        {n}
      </span>
      <h3
        className="kin-step-title"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h3>
      <p className="kin-step-body">{body}</p>
    </li>
  );
}

function MockHeroCard() {
  return (
    <div
      className="kin-hero relative px-7 py-7 sm:px-8 sm:py-8"
      aria-hidden="true"
    >
      <span className="kin-hero-rail" aria-hidden="true" />
      <div
        className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-kin-ember-soft"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-kin-ember kin-pulse"
            aria-hidden="true"
          />
          Overdraft Saturday
        </span>
        <span className="text-kin-bone-dim">2 days out</span>
      </div>

      <h3
        className="mt-3 text-[22px] sm:text-[26px] leading-tight tracking-tight text-kin-bone"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Already on it.
      </h3>

      <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-kin-bone-mute">
        Rent <span className="text-kin-bone tabular-nums">($2,100)</span>{" "}
        autopays from TD. You&rsquo;re at{" "}
        <span className="text-kin-bone tabular-nums">$1,650</span>. Dana owes{" "}
        <span className="text-kin-bone tabular-nums">$800</span> from the
        cottage trip — I drafted the request.
      </p>

      <div className="mt-5 grid gap-2">
        <MockAction label="Send e-transfer to Dana ($800)" primary />
        <MockAction label="Move $500 from joint savings" />
        <MockAction label="Both" />
        <MockAction label="Just call Dana" />
      </div>
    </div>
  );
}

function MockAction({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <div
      className={
        "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm " +
        (primary
          ? "kin-shimmer border-[rgba(255,107,31,0.45)] bg-[rgba(255,107,31,0.06)] text-kin-bone"
          : "border-[var(--kin-line-strong)] text-kin-bone-mute")
      }
    >
      <span className="truncate">{label}</span>
      <span
        className={
          "text-[10px] uppercase tracking-[0.22em] ml-3 shrink-0 " +
          (primary ? "text-kin-ember-soft" : "text-kin-bone-dim")
        }
        style={{ fontFamily: "var(--font-mono)" }}
      >
        1 tap
      </span>
    </div>
  );
}

// ─── Tiny inline icons ───────────────────────────────────────────────────────

function ArrowRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function EyeMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BoltMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function MemoryMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 00-5 5v1a3 3 0 00-3 3v3a3 3 0 003 3v1a5 5 0 005 5 5 5 0 005-5v-1a3 3 0 003-3v-3a3 3 0 00-3-3V7a5 5 0 00-5-5z" />
      <path d="M8 11h.01M16 11h.01M9 16h6" />
    </svg>
  );
}
