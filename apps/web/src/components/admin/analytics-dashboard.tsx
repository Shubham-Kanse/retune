"use client";

import { BarChart3, Clock, Target, TrendingUp, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface AnalyticsDashboardProps {
  isAdmin?: boolean;
}

interface Metrics {
  totalUsers: number;
  totalGenerations: number;
  averageAtsScore: number;
  conversionRate: number;
  averageGenerationTime: number;
  topCompanies: Array<{ name: string; count: number }>;
  userGrowth: Array<{ date: string; users: number }>;
  generationTrends: Array<{ date: string; count: number }>;
}

export function AnalyticsDashboard({ isAdmin = false }: AnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, [timeRange]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch(`/api/admin/analytics?range=${timeRange}`);
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rt-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-muted rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time insights and metrics</p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded ${
                timeRange === range
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Users"
          value={metrics.totalUsers.toLocaleString()}
          icon={Users}
          trend="+12%"
          trendUp={true}
        />
        <MetricCard
          title="Generations"
          value={metrics.totalGenerations.toLocaleString()}
          icon={Zap}
          trend="+8%"
          trendUp={true}
        />
        <MetricCard
          title="Avg ATS Score"
          value={`${metrics.averageAtsScore}%`}
          icon={Target}
          trend="+3%"
          trendUp={true}
        />
        <MetricCard
          title="Conversion Rate"
          value={`${(metrics.conversionRate * 100).toFixed(1)}%`}
          icon={TrendingUp}
          trend="-2%"
          trendUp={false}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rt-card p-6">
          <h3 className="text-lg font-semibold mb-4">User Growth</h3>
          <div className="h-64 flex items-end justify-between gap-2">
            {metrics.userGrowth.map((point, i) => (
              <div
                key={i}
                className="bg-primary flex-1 rounded-t"
                style={{
                  height: `${(point.users / Math.max(...metrics.userGrowth.map((p) => p.users))) * 100}%`,
                  minHeight: "4px",
                }}
                title={`${point.date}: ${point.users} users`}
              />
            ))}
          </div>
        </div>

        <div className="rt-card p-6">
          <h3 className="text-lg font-semibold mb-4">Top Companies</h3>
          <div className="space-y-3">
            {metrics.topCompanies.slice(0, 8).map((company, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm">{company.name}</span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 bg-primary rounded"
                    style={{
                      width: `${(company.count / (metrics.topCompanies[0]?.count ?? 1)) * 100}px`,
                      minWidth: "8px",
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {company.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rt-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Performance</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Avg Generation Time</span>
              <span className="text-sm font-medium">{metrics.averageGenerationTime}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <span className="text-sm font-medium">98.5%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Error Rate</span>
              <span className="text-sm font-medium">1.5%</span>
            </div>
          </div>
        </div>

        <div className="rt-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Usage Patterns</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Peak Hours</span>
              <span className="text-sm font-medium">2-4 PM EST</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Most Active Day</span>
              <span className="text-sm font-medium">Tuesday</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Avg Session Time</span>
              <span className="text-sm font-medium">12m 34s</span>
            </div>
          </div>
        </div>

        <div className="rt-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Quality Metrics</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">ATS Score 85%+</span>
              <span className="text-sm font-medium">76%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">User Satisfaction</span>
              <span className="text-sm font-medium">4.8/5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Refinement Rate</span>
              <span className="text-sm font-medium">23%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  trendUp?: boolean;
}

function MetricCard({ title, value, icon: Icon, trend, trendUp }: MetricCardProps) {
  return (
    <div className="rt-card p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-semibold">{value}</span>
        {trend && (
          <span className={`text-xs ${trendUp ? "text-emerald-600" : "text-red-600"}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
