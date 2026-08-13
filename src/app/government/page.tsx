"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsService } from "@/lib/services/analytics";
import type { AnalyticsSummary, TrendDataPoint, CategoryDistribution, DepartmentPerformance, SLAData, WardHealth } from "@/types/analytics";
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, Clock, MapPin } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, PieChart, Pie, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const COLORS = ['#853953', '#612D53', '#A85A74', '#4A1D3D', '#D989A3'];

export default function GovernmentDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [categories, setCategories] = useState<CategoryDistribution[]>([]);
  const [departments, setDepartments] = useState<DepartmentPerformance[]>([]);
  const [wards, setWards] = useState<WardHealth[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [sum, trnd, cats, depts, wrds] = await Promise.all([
          analyticsService.getSummary(),
          analyticsService.getTrends(),
          analyticsService.getCategoryDistribution(),
          analyticsService.getDepartmentPerformance(),
          analyticsService.getWardHealth()
        ]);
        
        setSummary(sum);
        setTrends(trnd);
        setCategories(cats);
        setDepartments(depts);
        setWards(wrds);
      } catch (error) {
        console.error("Failed to load analytics", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Command Center" 
        description="City-wide civic operations overview and analytics."
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Complaints</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalComplaints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1 text-emerald-600 flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" /> +{summary.complaintsToday} today
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round((summary.resolvedComplaints / summary.totalComplaints) * 100)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.resolvedComplaints.toLocaleString()} total resolved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.slaCompliance}%</div>
            <p className="text-xs text-muted-foreground mt-1">Target: 90%</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.criticalComplaints}</div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate attention</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="wards">Wards Map</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {/* Trends Chart */}
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Resolution Trends (30 Days)</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(val) => new Date(val).getDate().toString()} />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="complaints" stroke="#64748b" strokeWidth={2} name="Reported" dot={false} />
                      <Line type="monotone" dataKey="resolved" stroke="#853953" strokeWidth={2} name="Resolved" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Issue Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categories}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="count"
                      >
                        {categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => Number(value).toLocaleString()}
                        contentStyle={{ borderRadius: '8px' }}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="right" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Performance Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departments} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="department" />
                    <YAxis yAxisId="left" orientation="left" stroke="#853953" />
                    <YAxis yAxisId="right" orientation="right" stroke="#64748b" />
                    <Tooltip contentStyle={{ borderRadius: '8px' }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="resolved" fill="#853953" name="Resolved" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="open" fill="#cbd5e1" name="Open" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="slaCompliance" stroke="#10b981" strokeWidth={3} name="SLA %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wards" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Ward Health Map</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] bg-muted rounded-md flex items-center justify-center relative border overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=12.9716,77.5946&zoom=12&size=800x400&style=feature:all|element:labels|visibility:off&style=feature:water|element:geometry|color:0x3b82f6&key=placeholder')] bg-cover bg-center opacity-40" />
                  <div className="z-10 text-center bg-background/80 p-6 rounded-lg backdrop-blur-sm border shadow-sm">
                    <MapPin className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <h3 className="font-semibold text-lg">Interactive Heatmap</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      Live integration with GIS system to visualize complaint density and ward health scores.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {wards.map((ward) => (
                <Card key={ward.ward}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{ward.ward}</span>
                      <Badge variant={
                        ward.healthScore === 'good' ? 'success' :
                        ward.healthScore === 'moderate' ? 'warning' :
                        ward.healthScore === 'poor' ? 'destructive' : 'critical'
                      } className="capitalize">
                        {ward.healthScore}
                      </Badge>
                    </div>
                    <div className="space-y-1.5 text-sm mt-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Open Issues</span>
                        <span className="font-medium">{ward.openComplaints}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SLA Compliance</span>
                        <span className="font-medium">{ward.slaCompliance}%</span>
                      </div>
                      <Progress value={ward.slaCompliance} className="h-1.5 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
