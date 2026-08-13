"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { complaintService } from "@/lib/services/complaints";
import type { Complaint } from "@/types/complaint";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";
import { ArrowLeft, MapPin, Building2, Calendar, Sparkles, AlertCircle, CheckCircle2, Clock, MapIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

export default function ComplaintDetailView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const id = params.id as string;
  const processAI = searchParams.get("process") === "ai";
  
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiProgress, setAiProgress] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadComplaint() {
      try {
        const data = await complaintService.getComplaintById(id);
        if (mounted) {
          setComplaint(data);
          setIsLoading(false);

          // If triggered to process AI (from report form)
          if (processAI && data && !data.aiAnalysis) {
            simulateAIProcessing();
          }
        }
      } catch (error) {
        console.error("Failed to load complaint", error);
        if (mounted) setIsLoading(false);
      }
    }

    async function simulateAIProcessing() {
      // Simulate progress bar
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 90) progress = 90; // Hold at 90 until API returns
        if (mounted) setAiProgress(progress);
      }, 300);

      try {
        // Trigger the backend to update with AI analysis
        const updated = await complaintService.triggerAIAnalysis(id);
        clearInterval(interval);
        
        if (mounted) {
          setAiProgress(100);
          setTimeout(() => setComplaint(updated), 500);
        }
      } catch (e) {
        clearInterval(interval);
      }
    }

    loadComplaint();

    return () => {
      mounted = false;
    };
  }, [id, processAI]);

  if (isLoading) {
    return <div className="p-8 text-center"><Progress value={30} className="w-1/2 mx-auto" /></div>;
  }

  if (!complaint) {
    return <div className="p-8 text-center text-muted-foreground">Complaint not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Back</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-muted-foreground">{complaint.id}</span>
            <StatusBadge status={complaint.status} />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{complaint.title}</h1>
        </div>
        {complaint.priorityLevel && (
          <PriorityBadge level={complaint.priorityLevel} score={complaint.priorityScore} className="text-base px-3 py-1" />
        )}
      </div>

      {/* AI Processing Overlay / Alert */}
      {processAI && aiProgress < 100 && (
        <Card className="border-primary bg-primary/5 shadow-md overflow-hidden relative">
          {/* Animated gradient border effect could go here */}
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-primary">AI Agent Analyzing Report...</h3>
                <p className="text-sm text-muted-foreground">Categorizing issue, checking for duplicates, and assigning priority.</p>
              </div>
            </div>
            <Progress value={aiProgress} className="h-2 w-full bg-primary/20" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Extracting context...</span>
              <span>{aiProgress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Results Alert (shows after processing or if already exists) */}
      {complaint.aiAnalysis && (
        <Card className="border-primary/50 bg-primary/5 shadow-sm">
          <CardHeader className="pb-3 border-b border-primary/10">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-base text-primary">AI Analysis Complete</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Routed To</span>
                <p className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {complaint.departmentName}
                </p>
                <p className="text-xs text-primary">{complaint.aiAnalysis.departmentConfidence}% Confidence</p>
              </div>
              
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Priority Level</span>
                <p className="font-medium text-destructive capitalize">
                  {complaint.priorityLevel} ({complaint.priorityScore}/100)
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Duplicate Check</span>
                {complaint.aiAnalysis.duplicateCheck.hasDuplicates ? (
                  <p className="text-amber-600 font-medium flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    Found {complaint.aiAnalysis.duplicateCheck.similarCount} similar reports
                  </p>
                ) : (
                  <p className="text-emerald-600 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    No duplicates found
                  </p>
                )}
              </div>
            </div>

            <Separator className="bg-primary/10" />
            
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Priority Factors</span>
              <div className="flex flex-wrap gap-2">
                {complaint.aiAnalysis.priorityFactors.map((factor, idx) => (
                  <Badge key={idx} variant="outline" className="bg-background/50 text-xs border-primary/20">
                    {factor.factor}: {factor.description}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Details & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
              </div>
              
              {complaint.media && complaint.media.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Evidence</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {complaint.media.map(media => (
                      <div key={media.id} className="relative rounded-md overflow-hidden border aspect-video">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={media.url} alt="Evidence" className="object-cover w-full h-full" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                
                {/* Submitted */}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">Complaint Submitted</span>
                      <time className="text-xs text-muted-foreground">{formatRelativeTime(complaint.createdAt)}</time>
                    </div>
                    <p className="text-sm text-muted-foreground">Report filed by {complaint.citizenName}</p>
                  </div>
                </div>

                {/* AI Analysis (if exists) */}
                {complaint.aiAnalysis && (
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">AI Triaged</span>
                        <time className="text-xs text-muted-foreground">{formatRelativeTime(complaint.aiAnalysis.processedAt)}</time>
                      </div>
                      <p className="text-sm text-muted-foreground">Categorized and routed to {complaint.departmentName}</p>
                    </div>
                  </div>
                )}

                 {/* Assigned (if exists) */}
                 {(['assigned', 'in_progress', 'proof_submitted', 'resolved'].includes(complaint.status)) && (
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-secondary text-secondary-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">Officer Assigned</span>
                        <time className="text-xs text-muted-foreground">--</time>
                      </div>
                      <p className="text-sm text-muted-foreground">Assigned to {complaint.officerName}</p>
                    </div>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Info Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-32 bg-muted rounded-md border flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=12.9716,77.5946&zoom=15&size=400x200&markers=color:red%7C12.9716,77.5946&key=placeholder')] bg-cover bg-center opacity-70" />
                <MapIcon className="h-6 w-6 text-destructive absolute" />
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>{complaint.location.address}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">Date Reported</span>
                <span className="font-medium">{new Date(complaint.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium text-right max-w-[150px] truncate" title={complaint.departmentName}>
                  {complaint.departmentName || "Pending AI"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium capitalize">{complaint.category.replace('_', ' ')}</span>
              </div>
              {complaint.slaDeadline && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Resolution Target</span>
                  <span className="font-medium text-amber-600">
                    {new Date(complaint.slaDeadline).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
