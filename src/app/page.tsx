import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowRight, Brain, MapPin, CheckCircle, BarChart } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from '@/lib/constants';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Public Navbar */}
      <header className="sticky top-0 z-40 w-full border-b bg-card text-card-foreground shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center">
            <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground mr-3">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">{APP_NAME}</span>
          </div>
          <div className="flex space-x-4">
            <Link href="/auth/login">
              <Button variant="ghost">Log In</Button>
            </Link>
            <Link href="/auth/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-4 py-24 md:py-32 overflow-hidden bg-secondary">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1572204292164-b35ba40e596b?q=80&w=1920&auto=format&fit=crop')] opacity-10 bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-secondary via-secondary/90 to-transparent" />
          
          <div className="container relative mx-auto max-w-5xl text-center z-10 text-white">
            <h1 className="mb-6 text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
              {APP_TAGLINE}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-secondary-foreground/80 sm:text-xl">
              {APP_DESCRIPTION}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/citizen/report">
                <Button size="lg" className="h-14 px-8 text-lg font-semibold bg-primary hover:bg-primary/90 text-white w-full sm:w-auto">
                  Report an Issue
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/government">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm w-full sm:w-auto">
                  Explore Governance
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section className="py-24 px-4 bg-background">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">How NagrikSetu Works</h2>
              <p className="mt-4 text-lg text-muted-foreground">An intelligent end-to-end civic operations platform.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: MapPin, title: "Report", desc: "Citizen uploads a photo with GPS coordinates." },
                { icon: Brain, title: "AI Analysis", desc: "System classifies, deduplicates, and prioritizes the issue." },
                { icon: CheckCircle, title: "Resolution", desc: "Assigned officer completes work and provides proof." },
                { icon: BarChart, title: "Governance", desc: "Supervisors verify and city dashboards update in real-time." }
              ].map((step, i) => (
                <div key={i} className="relative p-6 bg-card border rounded-xl shadow-sm group hover:border-primary/50 transition-colors">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t bg-card py-8 text-center text-muted-foreground">
        <div className="container mx-auto px-4">
          <p>© 2026 NagrikSetu. Built for Smart India Hackathon.</p>
        </div>
      </footer>
    </div>
  );
}
