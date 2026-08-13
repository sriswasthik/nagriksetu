"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, AlertTriangle, ArrowRight, Loader2, MapPin } from "lucide-react";
import { complaintService } from "@/lib/services/complaints";
import { authService } from "@/lib/services/auth";
import type { Complaint } from "@/types/complaint";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";

export default function CitizenDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("Citizen");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const user = await authService.getCurrentUser();
        if (user) setUserName(user.name.split(' ')[0]);

        // Get all complaints for citizen (mocked to return all for demo)
        const allComplaints = await complaintService.getComplaints();
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
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeComplaints = complaints.filter(c => !['resolved', 'rejected', 'verified'].includes(c.status));
  const awaitingVerification = complaints.filter(c => c.status === 'citizen_confirmation');
  const resolvedComplaints = complaints.filter(c => ['resolved', 'verified'].includes(c.status));

  return (
    <div>
      <PageHeader
        title={`Good morning, ${userName}`}
        description="Report civic issues and track their resolution."
        action={
          <Link href="/citizen/report">
            <Button>
              Report a Civic Issue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Complaints</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeComplaints.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently being processed</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Action Required</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{awaitingVerification.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting your confirmation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Issues</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedComplaints.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully addressed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{complaints.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Since account creation</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Recent Complaints</h2>
          <Link href="/citizen/complaints">
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </div>

        {complaints.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No complaints reported</h3>
              <p className="text-muted-foreground max-w-sm mt-2 mb-6">
                You haven&apos;t reported any civic issues yet. Help make the city better by reporting issues you find.
              </p>
              <Link href="/citizen/report">
                <Button>Report an Issue</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {complaints.slice(0, 3).map((complaint) => (
              <Card key={complaint.id} className="flex flex-col hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{complaint.id}</span>
                    <StatusBadge status={complaint.status} />
                  </div>
                  <CardTitle className="text-base line-clamp-1">{complaint.title}</CardTitle>
                  <CardDescription className="line-clamp-2 mt-1.5">{complaint.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mb-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{complaint.location.address}</span>
                  </div>
                  {complaint.priorityLevel && (
                    <div className="mt-3">
                      <PriorityBadge level={complaint.priorityLevel} />
                    </div>
                  )}
                </CardContent>
                <div className="p-6 pt-0 mt-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Updated {formatRelativeTime(complaint.updatedAt)}
                    </span>
                    <Link href={`/citizen/complaints/${complaint.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 -mr-3">
                        View details
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


