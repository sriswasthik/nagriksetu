import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { Container, Section, SectionHeading } from '@/components/layout/Container';
import { IsometricCityLazy } from '@/components/visuals/IsometricCityLazy';
import { Reveal, RevealGroup, RevealItem } from '@/components/shared/Reveal';
import { APP_NAME, COMPLAINT_CATEGORIES } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Track Your City. Improve Your Community.',
};

/** How the platform works, end to end. */
const WORKFLOW = [
  {
    icon: Camera,
    title: 'Report',
    body: 'Photograph the problem. Your location is captured automatically, so you never type an address.',
  },
  {
    icon: ScanSearch,
    title: 'Triage',
    body: 'The report is categorised, prioritised and routed to the department responsible for that kind of work.',
  },
  {
    icon: ClipboardCheck,
    title: 'Resolve',
    body: 'A field officer accepts the work order, completes it, and submits photographic proof of the fix.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    body: 'A supervisor checks the evidence before anything is marked resolved — and you can reopen it if it is not.',
  },
] as const;

const CAPABILITIES = [
  {
    icon: MapPin,
    title: 'Everything has a location',
    body: 'Reports are anchored to GPS coordinates, so issues can be mapped, clustered and spotted as patterns rather than handled one by one.',
  },
  {
    icon: CheckCircle2,
    title: 'Nothing closes unverified',
    body: 'Every resolution needs photographic proof and a supervisor sign-off. Closing a ticket and fixing a problem are not the same thing.',
  },
  {
    icon: BarChart3,
    title: 'Accountability by default',
    body: 'Response times, resolution rates and departmental workload are measured against service-level targets, not estimated.',
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-40 w-full border-b bg-card/90 backdrop-blur-md">
        <Container width="wide">
          <div className="flex h-16 items-center justify-between">
            <Logo size="md" />

            {/*
              Tighter horizontal padding below `sm`.

              At 320px — an iPhone SE, and still a real share of civic
              traffic — the logo plus both buttons at their default px-5
              pushed the document 34px wider than the viewport, so the
              whole landing page scrolled sideways. Reducing the padding
              keeps both actions rather than hiding one, which is the
              alternative and a worse one for a page whose job is to get
              somebody signed in.
            */}
            <nav
              aria-label="Account"
              className="flex shrink-0 items-center gap-1.5 sm:gap-3"
            >
              <Button variant="ghost" asChild className="px-2.5 sm:px-5">
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button asChild className="px-3 sm:px-5">
                <Link href="/auth/register">Get started</Link>
              </Button>
            </nav>
          </div>
        </Container>
      </header>

      <main id="main-content" className="flex-1">
        {/* ================= HERO ================= */}
        <section className="relative overflow-hidden border-b bg-neutral-900">
          {/* Depth layers — city grid + brand spotlight, both low contrast */}
          <div
            aria-hidden="true"
            className="backdrop-grid-invert mask-fade-edges absolute inset-0"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(133,57,83,0.42),transparent_72%)]"
          />

          <Container width="wide" className="relative">
            <div className="grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
              {/* ---- Copy ---- */}
              <div className="max-w-2xl">
                <Reveal>
                  <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Civic issue reporting and resolution tracking
                  </p>
                </Reveal>

                <Reveal delay={0.06}>
                  <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    Track your city.
                    <br />
                    <span className="text-primary-300">Improve your community.</span>
                  </h1>
                </Reveal>

                <Reveal delay={0.12}>
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                    Report a pothole, a broken streetlight or an overflowing drain in
                    under a minute. Follow it from submission to verified repair — and
                    see what your city is fixing, street by street.
                  </p>
                </Reveal>

                <Reveal delay={0.18}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Button
                      size="lg"
                      asChild
                      className="h-12 px-7 text-base shadow-lg shadow-primary-900/30"
                    >
                      <Link href="/citizen/report">
                        Report an Issue
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>

                    <Button
                      size="lg"
                      variant="outline"
                      asChild
                      className="h-12 border-white/20 bg-white/5 px-7 text-base text-white backdrop-blur-sm hover:bg-white/10 hover:text-white"
                    >
                      <Link href="/citizen/map">Explore City Issues</Link>
                    </Button>
                  </div>
                </Reveal>

                <Reveal delay={0.24}>
                  <p className="mt-7 text-sm text-white/45">
                    Free for residents. No app install required.
                  </p>
                </Reveal>
              </div>

              {/* ---- 3D city (decorative, md+ only) ---- */}
              <div className="hidden md:flex md:justify-center lg:justify-end">
                <IsometricCityLazy className="w-full max-w-[420px]" />
              </div>
            </div>
          </Container>
        </section>

        {/* ================= WORKFLOW ================= */}
        <Section spacing="lg" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="backdrop-grid-sm mask-fade-b absolute inset-0 opacity-60"
          />

          <Container width="wide" className="relative">
            <SectionHeading
              eyebrow="How it works"
              title="From a photo on the street to a verified repair"
              description="Four stages, each with a clear owner. You can see which stage your report is at, at any time."
            />

            <RevealGroup className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {WORKFLOW.map((step, index) => (
                <RevealItem key={step.title} className="relative">
                  {/* Connector between steps on wide screens */}
                  {index < WORKFLOW.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[3.25rem] top-5 hidden h-px w-[calc(100%-2.5rem)] bg-gradient-to-r from-border to-transparent lg:block"
                    />
                  )}

                  <div className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-xl border bg-card shadow-sm">
                    <step.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span className="tabular absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[0.625rem] font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </RevealItem>
              ))}
            </RevealGroup>
          </Container>
        </Section>

        {/* ================= CAPABILITIES ================= */}
        <Section spacing="lg" className="border-y bg-card">
          <Container width="wide">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <SectionHeading
                eyebrow="Why it works"
                title="Built so issues actually get closed"
                description="Most reporting tools stop at the report. This one is designed around what happens next."
              />

              <RevealGroup className="space-y-8">
                {CAPABILITIES.map((item) => (
                  <RevealItem key={item.title} className="flex gap-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </Container>
        </Section>

        {/* ================= CATEGORIES ================= */}
        <Section spacing="lg">
          <Container width="wide">
            <SectionHeading
              eyebrow="What you can report"
              title="If it affects your street, it belongs here"
              align="center"
            />

            <RevealGroup className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2.5">
              {COMPLAINT_CATEGORIES.filter((c) => c.value !== 'other').map(
                (category) => (
                  <RevealItem key={category.value}>
                    <span className="inline-flex items-center rounded-full border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs">
                      {category.label}
                    </span>
                  </RevealItem>
                )
              )}
            </RevealGroup>
          </Container>
        </Section>

        {/* ================= CTA ================= */}
        <Section spacing="lg" className="border-t">
          <Container width="content">
            <Reveal className="relative overflow-hidden rounded-2xl border bg-neutral-900 px-6 py-14 text-center sm:px-14">
              <div
                aria-hidden="true"
                className="backdrop-grid-invert mask-fade-edges absolute inset-0"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_50%_100%,rgba(133,57,83,0.4),transparent_70%)]"
              />

              <div className="relative">
                <h2 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Spotted something broken?
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/70">
                  It takes about a minute to report, and you will be able to follow
                  exactly what happens next.
                </p>

                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button size="lg" asChild className="h-12 px-7 text-base">
                    <Link href="/citizen/report">
                      Report an Issue
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="h-12 border-white/20 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/auth/register">Create an account</Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </Container>
        </Section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t bg-card">
        <Container width="wide">
          <div className="flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
            <Logo size="sm" />

            <p className="text-center text-sm text-muted-foreground sm:text-right">
              © 2026 {APP_NAME}. Built for the Smart India Hackathon.
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
