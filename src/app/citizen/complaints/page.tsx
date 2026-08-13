"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { complaintService } from "@/lib/services/complaints";
import type { Complaint, ComplaintStatus } from "@/types/complaint";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/lib/utils";
import { Search, Filter, Loader2, MapPin } from "lucide-react";

export default function CitizenComplaintsList() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function loadComplaints() {
      try {
        const data = await complaintService.getComplaints();
        setComplaints(data);
      } catch (error) {
        console.error("Failed to load complaints", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadComplaints();
  }, []);

  const filteredComplaints = complaints.filter(c => {
    let matchesSearch = true;
    let matchesStatus = true;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      matchesSearch = 
        c.title.toLowerCase().includes(q) || 
        c.id.toLowerCase().includes(q) ||
        c.location.address.toLowerCase().includes(q);
    }

    if (statusFilter !== "all") {
      matchesStatus = c.status === statusFilter;
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
        title="My Reports" 
        description="View and track the status of all your submitted issues."
        action={
          <Link href="/citizen/report">
            <Button>Report New Issue</Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by ID, title, or location..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48 flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="citizen_confirmation">Needs Confirmation</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredComplaints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">No complaints found</h3>
            <p className="text-muted-foreground max-w-sm mt-2">
              Try adjusting your search or filters to find what you&apos;re looking for.
            </p>
            {(searchQuery || statusFilter !== "all") && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredComplaints.map((complaint) => (
            <Card key={complaint.id} className="hover:border-primary/50 transition-colors">
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-mono text-sm font-medium text-muted-foreground">{complaint.id}</span>
                    <StatusBadge status={complaint.status} />
                    {complaint.priorityLevel && (
                      <PriorityBadge level={complaint.priorityLevel} />
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatRelativeTime(complaint.updatedAt)}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold mb-1">{complaint.title}</h3>
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                    {complaint.description}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[200px]">{complaint.location.address}</span>
                    </div>
                    {complaint.departmentName && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted">
                        <span className="text-xs font-medium text-foreground">{complaint.departmentName}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex md:flex-col justify-end md:justify-center p-5 pt-0 md:pt-5 border-t md:border-t-0 md:border-l md:w-48 gap-2 bg-muted/20">
                  <Link href={`/citizen/complaints/${complaint.id}`} className="w-full">
                    <Button variant="outline" className="w-full">View Details</Button>
                  </Link>
                  {complaint.status === "citizen_confirmation" && (
                    <Link href={`/citizen/complaints/${complaint.id}`} className="w-full">
                      <Button className="w-full">Confirm Fix</Button>
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
