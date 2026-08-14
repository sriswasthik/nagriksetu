"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, AlertTriangle, ArrowRight, Loader2, MapPin, Clock, PlusCircle } from "lucide-react";
import { getMyComplaints } from "@/lib/services/complaints";
import { authService } from "@/lib/services/auth";
import type { Complaint } from "@/types/complaint";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function CitizenDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("Citizen");
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    setGreeting(getTimeGreeting());
    async function loadDashboard() {
      try {
        const user = await authService.getCurrentUser();
        if (user) setUserName(user.name.split(' ')[0]);

        const allComplaints = await getMyComplaints();
        setComplaints(allComplaints);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const activeComplaints = complaints.filter(c => !['resolved', 'rejected', 'verified'].includes(c.status));
  const awaitingVerification = complaints.filter(c => c.status === 'citizen_confirmation');
  const resolvedComplaints = complaints.filter(c => ['resolved', 'verified'].includes(c.status));

  const getBorderColorByStatus = (status: string) => {
    switch (status) {
      case 'resolved':
      case 'verified':
        return 'border-l-emerald-500';
      case 'rejected':
        return 'border-l-red-500';
      case 'citizen_confirmation':
        return 'border-l-violet-500';
      case 'in_progress':
      case 'accepted':
      case 'ai_analyzed':
        return 'border-l-blue-500';
      default:
        return 'border-l-amber-500';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title={`${greeting}, ${userName}`}
        description="Report civic issues and track their resolution in real time."
        action={
          <Link href="/citizen/report">
            <Button size="lg" className="shadow-sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Report a Civic Issue
            </Button>
          </Link>
        }
      />

      {/* Stat Cards with entrance stagger */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Active Complaints",
            count: activeComplaints.length,
            desc: "Currently being processed",
            icon: AlertTriangle,
            iconBg: "bg-amber-500/10 text-amber-600",
            stagger: "stagger-1",
          },
          {
            title: "Action Required",
            count: awaitingVerification.length,
            desc: "Awaiting your confirmation",
            icon: Clock,
            iconBg: "bg-violet-500/10 text-violet-600",
            stagger: "stagger-2",
          },
          {
            title: "Resolved Issues",
            count: resolvedComplaints.length,
            desc: "Successfully addressed",
            icon: CheckCircle2,
            iconBg: "bg-emerald-500/10 text-emerald-600",
            stagger: "stagger-3",
          },
          {
            title: "Total Reports",
            count: complaints.length,
            desc: "All submitted complaints",
            icon: FileText,
            iconBg: "bg-primary/10 text-primary",
            stagger: "stagger-4",
          },
        ].map((stat, i) => (
          <Card key={i} className={`animate-slide-up ${stat.stagger}`}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </p>
                <p className="text-3xl font-extrabold text-foreground mt-1 tabular-nums">
                  {stat.count}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.desc}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.iconBg}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Complaints */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Recent Complaints</h2>
            <p className="text-xs text-muted-foreground">Latest updates on your reported issues</p>
          </div>
          {complaints.length > 0 && (
            <Link href="/citizen/complaints">
              <Button variant="outline" size="sm" className="h-8 text-xs">
                View All ({complaints.length})
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>

        {complaints.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/8 flex items-center justify-center mb-4 text-primary">
                <MapPin className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">No complaints reported yet</h3>
              <p className="text-muted-foreground max-w-sm mt-2 mb-6 text-sm leading-relaxed">
                Help improve your neighborhood by reporting civic issues like potholes, streetlights, or water leaks.
              </p>
              <Link href="/citizen/report">
                <Button className="shadow-sm">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Report Your First Issue
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {complaints.slice(0, 3).map((complaint) => (
              <Card
                key={complaint.id}
                className={`flex flex-col border-l-4 ${getBorderColorByStatus(complaint.status)} hover:shadow-md transition-all duration-200`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {complaint.complaint_number || complaint.id.slice(0, 8)}
                    </span>
                    <StatusBadge status={complaint.status} />
                  </div>
                  <CardTitle className="text-base font-bold line-clamp-1 text-foreground">
                    {complaint.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 mt-1 text-xs leading-relaxed">
                    {complaint.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 pb-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-3">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="truncate">{complaint.address || "Location not specified"}</span>
                  </div>
                  {complaint.priority_level && (
                    <PriorityBadge level={complaint.priority_level} />
                  )}
                </CardContent>

                <div className="p-4 pt-0 mt-auto border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Updated {formatRelativeTime(complaint.updated_at)}</span>
                  <Link href={`/citizen/complaints/${complaint.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-primary font-semibold hover:text-primary">
                      Details →
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
