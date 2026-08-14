import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowRight, Brain, MapPin, CheckCircle, BarChart, Zap, Users, Shield, Sparkles, AlertTriangle, Clock } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from '@/lib/constants';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Public Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-card/90 backdrop-blur-lg text-card-foreground">
        <div className="container mx-auto flex h-[60px] items-center justify-between px-4">
          <Link href="/" className="group flex items-center">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-primary-foreground mr-2.5 shadow-sm transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-foreground transition-colors group-hover:text-primary">{APP_NAME}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground font-semibold">Log In</Button>
            </Link>
            <Link href="/auth/register">
              <Button className="shadow-sm font-semibold">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section with 3D Mockup */}
        <section className="relative px-4 pt-24 pb-36 md:pt-32 md:pb-48 overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-zinc-800" />
          {/* Glowing orbital background blurs */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-white/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-zinc-400/10 blur-[100px] rounded-full pointer-events-none" />

          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(254, 210, 79, 0.5) 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }} />
          
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-background to-transparent" />

          <div className="container relative mx-auto max-w-6xl z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Hero Text */}
              <div className="lg:col-span-7 text-center lg:text-left">
                {/* 3D Shimmer Badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-[#71717a]/40 bg-[#09090b]/80 backdrop-blur-md px-4 py-1.5 text-xs font-bold text-[white] shadow-lg mb-6 animate-fade-in">
                  <Zap className="h-4 w-4 text-[white] animate-pulse" />
                  <span>AI-POWERED CIVIC OPERATIONS</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[white] animate-pulse-dot" />
                </div>

                <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl text-balance leading-[1.1] animate-slide-up">
                  {APP_TAGLINE}
                </h1>
                
                <p className="mb-10 max-w-xl text-base text-white/85 sm:text-lg leading-relaxed animate-slide-up stagger-1">
                  {APP_DESCRIPTION}
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 animate-slide-up stagger-2">
                  <Link href="/citizen/report" className="w-full sm:w-auto">
                    <Button size="lg" className="h-13 px-8 text-base font-extrabold bg-[white] text-[black] hover:bg-[#f4f4f5] w-full shadow-lg transition-all duration-300 hover:scale-105 active:scale-95">
                      Report an Issue
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link href="/government" className="w-full sm:w-auto">
                    <Button size="lg" variant="outline" className="h-13 px-8 text-base font-semibold border-white/25 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md w-full transition-all duration-300">
                      Explore Governance
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column: 3D Floating Glassmorphism Preview Card */}
              <div className="lg:col-span-5 flex justify-center perspective-1000">
                <div className="w-full max-w-sm glass-dark-panel p-5 rounded-3xl animate-float-slow transition-all duration-500 hover:rotate-1 hover:scale-105">
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[10px] font-mono text-[white] font-semibold tracking-wider uppercase bg-[white]/10 px-2 py-0.5 rounded-full border border-[white]/20">
                      LIVE STREAM
                    </span>
                  </div>

                  {/* Mock Image Box */}
                  <div className="relative aspect-video rounded-2xl bg-gradient-to-br from-[#1E3B17] to-[#3C6E25] p-4 flex flex-col justify-between overflow-hidden mb-4 border border-white/10 group">
                    <div className="flex items-center justify-between z-10">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#09090b]/80 text-[#71717a] backdrop-blur-md px-2.5 py-1 rounded-full border border-[#71717a]/30">
                        <MapPin className="h-3 w-3 text-[white]" />
                        GPS Verified
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-400/30">
                        High Priority
                      </span>
                    </div>

                    <div className="z-10 mt-6">
                      <p className="text-xs text-white/60 font-mono">ID: NKS-2026-8941</p>
                      <p className="text-sm font-bold text-white line-clamp-1">Large Road Damage near Central Ward</p>
                    </div>

                    {/* Shimmer pulse */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                  </div>

                  {/* AI Status Pill */}
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs text-white/80">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Sparkles className="h-3.5 w-3.5 text-[white]" />
                        AI Analysis Status
                      </span>
                      <span className="text-[#71717a] font-semibold text-[11px]">Completed</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#71717a] to-[white] w-4/5 rounded-full animate-pulse" />
                    </div>
                    <p className="text-[11px] text-white/50">Auto-assigned to Engineering Division (SLA: 24h)</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* 3D Stats Bar */}
        <section className="relative -mt-16 z-20 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-3 gap-3 md:gap-6">
              {[
                { icon: Users, value: 'Citizens First', label: 'Direct Government Link', color: 'text-[black]' },
                { icon: Shield, value: 'Transparent', label: 'Real-time GPS Proof', color: 'text-[white]' },
                { icon: Brain, value: 'AI Powered', label: 'Auto Prioritization', color: 'text-[#71717a]' },
              ].map((stat, i) => (
                <div 
                  key={i} 
                  className="flex flex-col items-center justify-center p-5 bg-card border border-border/80 rounded-2xl text-center shadow-md hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1.5 group"
                >
                  <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <stat.icon className={`h-5 w-5 ${stat.color} group-hover:text-white transition-colors`} />
                  </div>
                  <p className="text-base font-extrabold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3D Workflow Section */}
        <section className="py-28 px-4 bg-background">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary uppercase tracking-wider mb-3">
                Intelligent Pipeline
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl text-balance">
                From Report to Verified Resolution
              </h2>
              <p className="mt-3 text-muted-foreground max-w-xl mx-auto text-base">
                An end-to-end civic operating workflow powered by geotagging, AI classification, and verification.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: MapPin, title: "Report", desc: "Citizen uploads photo with auto GPS coordinates.", step: "01", accent: "border-t-primary" },
                { icon: Brain, title: "AI Analysis", desc: "System classifies, deduplicates, and prioritizes.", step: "02", accent: "border-t-[white]" },
                { icon: CheckCircle, title: "Resolution", desc: "Assigned officer completes work with proof photo.", step: "03", accent: "border-t-[#71717a]" },
                { icon: BarChart, title: "Governance", desc: "Dashboards update and citizens confirm fix.", step: "04", accent: "border-t-primary" },
              ].map((item, i) => (
                <div 
                  key={i} 
                  className={`relative p-6 bg-card border border-border/80 ${item.accent} border-t-4 rounded-2xl group hover:shadow-card-hover transition-all duration-300 hover:-translate-y-2 card-3d`}
                >
                  {/* Step number */}
                  <span className="absolute top-4 right-4 text-xs font-mono font-extrabold text-muted-foreground/30 tabular-nums">
                    {item.step}
                  </span>
                  
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 group-hover:scale-110 shadow-xs">
                    <item.icon className="h-6 w-6" />
                  </div>
                  
                  <h3 className="mb-2 text-lg font-bold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-card py-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary text-primary-foreground shadow-xs">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <span className="text-base font-extrabold text-foreground">{APP_NAME}</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">© 2026 CityTrace · Smart India Hackathon</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
