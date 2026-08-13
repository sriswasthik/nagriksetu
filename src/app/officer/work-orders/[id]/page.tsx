"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { workOrderService } from "@/lib/services/workOrders";
import type { WorkOrder } from "@/types/workOrder";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { ArrowLeft, MapPin, MapIcon, Clock, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export default function WorkOrderDetailView() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Status Update State
  const [isUpdating, setIsUpdating] = useState(false);
  const [notes, setNotes] = useState("");
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await workOrderService.getWorkOrderById(id);
        setOrder(data);
      } catch (error) {
        console.error("Failed to load work order", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const handleUpdateStatus = async (newStatus: WorkOrder['status']) => {
    setIsUpdating(true);
    try {
      const media = proofPreview ? [{
        id: `med_${Date.now()}`,
        url: proofPreview,
        type: 'image' as const,
        uploadedAt: new Date().toISOString()
      }] : [];

      const updated = await workOrderService.updateWorkOrderStatus({
        workOrderId: id,
        status: newStatus,
        notes: notes.length > 0 ? notes : undefined,
        media: media,
        updatedBy: 'officer_1',
        timestamp: new Date().toISOString()
      });
      
      setOrder(updated);
      setNotes("");
      setProofPreview(null);
    } catch (error) {
      console.error("Failed to update status", error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Progress value={30} className="w-1/2 mx-auto" /></div>;
  }

  if (!order) {
    return <div className="p-8 text-center text-muted-foreground">Work order not found.</div>;
  }

  const isCompleted = order.status === 'completed' || order.status === 'proof_submitted';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Back to Tasks</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm font-bold text-primary">{order.id}</span>
            <Badge variant={order.status === 'assigned' ? 'warning' : 'info'} className="capitalize">
              {order.status.replace('_', ' ')}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">{order.complaintTitle}</h1>
          <div className="text-sm text-muted-foreground">
            Citizen Report Ref: <Link href="#" className="font-mono underline">{order.complaintId}</Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PriorityBadge level={order.priorityLevel} score={order.priorityScore} className="text-base px-3 py-1" />
          {!isCompleted && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
              <Clock className="h-4 w-4" />
              SLA: {order.slaHoursRemaining}h remaining
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Details & Action */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Action Card based on Status */}
          <Card className={isCompleted ? "border-emerald-200 bg-emerald-50/50" : "border-primary/50 shadow-md"}>
            <CardHeader>
              <CardTitle>
                {order.status === 'assigned' ? 'Accept Assignment' :
                 order.status === 'accepted' ? 'Start Work' :
                 order.status === 'in_progress' ? 'Submit Resolution Proof' :
                 'Work Completed'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.status === 'assigned' && (
                <div className="space-y-4">
                  <p className="text-sm">Please review the details and accept this assignment to acknowledge SLA terms.</p>
                  <Button onClick={() => handleUpdateStatus('accepted')} disabled={isUpdating} className="w-full sm:w-auto">
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Accept Assignment
                  </Button>
                </div>
              )}

              {order.status === 'accepted' && (
                <div className="space-y-4">
                  <p className="text-sm">Click start when you arrive on site and begin repairs.</p>
                  <Button onClick={() => handleUpdateStatus('in_progress')} disabled={isUpdating} className="w-full sm:w-auto">
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Start Work
                  </Button>
                </div>
              )}

              {order.status === 'in_progress' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Resolution Notes</label>
                    <Textarea 
                      placeholder="Describe what was fixed, materials used, etc..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Photographic Proof</label>
                    {!proofPreview ? (
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment"
                          className="hidden" 
                          id="proof-upload"
                          onChange={handleProofUpload}
                        />
                        <label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center">
                          <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                          <span className="font-medium text-sm">Take photo of resolved issue</span>
                        </label>
                      </div>
                    ) : (
                      <div className="relative rounded-lg overflow-hidden border aspect-video max-w-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proofPreview} alt="Proof" className="w-full h-full object-cover" />
                        <Button 
                          type="button" 
                          variant="secondary" 
                          size="sm" 
                          className="absolute top-2 right-2"
                          onClick={() => setProofPreview(null)}
                        >
                          Retake
                        </Button>
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={() => handleUpdateStatus('proof_submitted')} 
                    disabled={isUpdating || !proofPreview || notes.length < 5} 
                    className="w-full"
                  >
                    {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Proof for Review
                  </Button>
                </div>
              )}

              {isCompleted && (
                <div className="flex items-center gap-4 text-emerald-700">
                  <CheckCircle2 className="h-8 w-8" />
                  <div>
                    <p className="font-medium">Resolution submitted successfully.</p>
                    <p className="text-sm opacity-80">Awaiting citizen confirmation or supervisor review.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Citizen Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              {order.citizenEvidence && order.citizenEvidence.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {order.citizenEvidence.map(media => (
                    <div key={media.id} className="relative rounded-md overflow-hidden border aspect-video">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={media.url} alt="Evidence" className="object-cover w-full h-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No photos provided by citizen.</p>
              )}
            </CardContent>
          </Card>
          
          {order.resolutionEvidence && order.resolutionEvidence.length > 0 && (
             <Card>
             <CardHeader>
               <CardTitle className="text-lg">Resolution Evidence</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="grid grid-cols-2 gap-2 mb-4">
                   {order.resolutionEvidence.map(media => (
                     <div key={media.id} className="relative rounded-md overflow-hidden border aspect-video">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={media.url} alt="Resolution" className="object-cover w-full h-full" />
                     </div>
                   ))}
                 </div>
                 {order.resolutionNotes && (
                   <div>
                     <span className="text-sm font-medium text-muted-foreground">Notes:</span>
                     <p className="text-sm mt-1">{order.resolutionNotes}</p>
                   </div>
                 )}
             </CardContent>
           </Card>
          )}

        </div>

        {/* Right Col: Info Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-40 bg-muted rounded-md border flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=12.9716,77.5946&zoom=15&size=400x200&markers=color:red%7C12.9716,77.5946&key=placeholder')] bg-cover bg-center opacity-70" />
                <MapIcon className="h-6 w-6 text-destructive absolute" />
              </div>
              <div className="flex items-start gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>{order.location.address}</span>
              </div>
              <Button variant="outline" className="w-full">
                <MapPin className="mr-2 h-4 w-4" /> Open in Maps
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">SLA Deadline</span>
                <span className="font-medium text-amber-600">
                  {new Date(order.slaDeadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              {order.acceptedAt && (
                <div className="flex justify-between items-center py-1 border-b">
                  <span className="text-muted-foreground">Accepted</span>
                  <span>{new Date(order.acceptedAt).toLocaleTimeString([], { timeStyle: 'short' })}</span>
                </div>
              )}
               {order.startedAt && (
                <div className="flex justify-between items-center py-1 border-b">
                  <span className="text-muted-foreground">Work Started</span>
                  <span>{new Date(order.startedAt).toLocaleTimeString([], { timeStyle: 'short' })}</span>
                </div>
              )}
               {order.completedAt && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Resolved</span>
                  <span className="text-emerald-600 font-medium">
                    {new Date(order.completedAt).toLocaleTimeString([], { timeStyle: 'short' })}
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
