"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";
import type { WorkOrder } from "@/types/workOrder";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";
import { ClipboardList, AlertCircle, Clock, MapPin, CheckCircle2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function OfficerDashboard() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("Officer");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const user = await authService.getCurrentUser();
        if (user) {
          setUserName(user.name.split(' ')[0]);
          setDepartment(user.department || "");
        }

        // Mock load all work orders assigned to this officer
        const data = await workOrderService.getWorkOrders({ officerId: user?.id });
        setWorkOrders(data);
      } catch (error) {
        console.error("Failed to load officer dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const activeOrders = workOrders.filter(wo => ['assigned', 'accepted', 'in_progress'].includes(wo.status));
  const urgentOrders = activeOrders.filter(wo => wo.priorityLevel === 'critical' || wo.priorityLevel === 'high');
  const completedToday = workOrders.filter(wo => 
    (wo.status === 'completed' || wo.status === 'proof_submitted') && 
    new Date(wo.updatedAt).toDateString() === new Date().toDateString()
  );

  return (
    <div>
      <PageHeader 
        title={`Welcome, ${userName}`} 
        description={`Field Operations • ${department.replace('dept-', '').toUpperCase()} Department`}
      />

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">Active Assignments</CardTitle>
            <ClipboardList className="h-4 w-4 text-primary-foreground/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeOrders.length}</div>
            <p className="text-xs text-primary-foreground/70 mt-1">Pending your action</p>
          </CardContent>
        </Card>
        
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Urgent / SLA Risk</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{urgentOrders.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedToday.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Work orders resolved</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Priority Work Orders</h2>
          <Link href="/officer/work-orders">
            <Button variant="ghost" size="sm">View All <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>

        {activeOrders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <h3 className="text-lg font-semibold">You&apos;re all caught up!</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                There are no active work orders assigned to you at the moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeOrders.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 4).map((order) => (
              <Card key={order.id} className="flex flex-col hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono font-medium text-muted-foreground">{order.id}</span>
                    <Badge variant={order.status === 'assigned' ? 'warning' : 'info'} className="capitalize">
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg line-clamp-1">{order.complaintTitle}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mb-3">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{order.location.address}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <PriorityBadge level={order.priorityLevel} />
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                      <Clock className="h-3.5 w-3.5" />
                      {order.slaHoursRemaining}h remaining
                    </div>
                  </div>
                </CardContent>
                <div className="p-6 pt-0 mt-auto border-t">
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">
                      Assigned {formatRelativeTime(order.assignedAt)}
                    </span>
                    <Link href={`/officer/work-orders/${order.id}`}>
                      <Button size="sm">Open Task</Button>
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
