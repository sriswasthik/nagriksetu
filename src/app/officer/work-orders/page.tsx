"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workOrderService } from "@/lib/services/workOrders";
import { authService } from "@/lib/services/auth";
import type { WorkOrder } from "@/types/workOrder";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";
import { Search, Filter, Loader2, MapPin, Clock, Calendar, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function OfficerWorkOrdersList() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  useEffect(() => {
    async function loadData() {
      try {
        const user = await authService.getCurrentUser();
        const data = await workOrderService.getWorkOrders({ officerId: user?.id });
        setWorkOrders(data);
      } catch (error) {
        console.error("Failed to load work orders", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredOrders = workOrders.filter(wo => {
    let matchesSearch = true;
    let matchesStatus = true;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      matchesSearch = 
        wo.complaintTitle.toLowerCase().includes(q) || 
        wo.id.toLowerCase().includes(q) ||
        wo.location.address.toLowerCase().includes(q);
    }

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "active") {
        matchesStatus = ['assigned', 'accepted', 'in_progress'].includes(wo.status);
      } else {
        matchesStatus = wo.status === statusFilter;
      }
    }

    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader 
        title="My Work Orders" 
        description="Manage and update your assigned field tasks."
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by WO ID, title, or location..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48 flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                <SelectItem value="active">Active (Pending)</SelectItem>
                <SelectItem value="assigned">New Assignments</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="proof_submitted">Proof Submitted</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredOrders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
            <h3 className="text-lg font-semibold">No work orders found</h3>
            <p className="text-muted-foreground max-w-sm mt-2">
              You have no tasks matching your current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.sort((a, b) => b.priorityScore - a.priorityScore).map((order) => (
            <Card key={order.id} className="hover:border-primary/50 transition-colors">
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 p-5">
                  <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-muted-foreground">{order.id}</span>
                      <Badge variant={order.status === 'assigned' ? 'warning' : 'info'} className="capitalize">
                        {order.status.replace('_', ' ')}
                      </Badge>
                      <PriorityBadge level={order.priorityLevel} />
                    </div>
                    {order.status !== 'completed' && order.status !== 'proof_submitted' && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                        <Clock className="h-3.5 w-3.5" />
                        SLA: {order.slaHoursRemaining}h left
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-bold mb-1">{order.complaintTitle}</h3>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mb-4">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{order.location.address}</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Assigned: {new Date(order.assignedAt).toLocaleDateString()}
                    </div>
                    <div className="text-muted-foreground">
                      Ref: <span className="font-mono text-xs">{order.complaintId}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex md:flex-col justify-end md:justify-center p-5 pt-0 md:pt-5 border-t md:border-t-0 md:border-l md:w-48 gap-2 bg-muted/20">
                  <Link href={`/officer/work-orders/${order.id}`} className="w-full">
                    <Button className="w-full h-11 md:h-12">
                      {order.status === 'assigned' ? 'Review & Accept' : 
                       order.status === 'proof_submitted' || order.status === 'completed' ? 'View Details' : 'Update Status'}
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
