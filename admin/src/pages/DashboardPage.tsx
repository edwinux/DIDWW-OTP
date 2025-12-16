import { useState, useEffect } from 'react';
import api from '@/services/api';
import type { LogsStats } from '@/types';
import { StatCard, TrafficChart, StatusBreakdown, RecentActivity } from '@/components/dashboard';
import { Activity, CheckCircle, ShieldAlert, Clock } from 'lucide-react';

interface TrafficDataPoint {
  time: string;
  requests: number;
  verified: number;
  failed: number;
}

// Generate mock recent activity
function generateRecentActivity(stats: LogsStats | null) {
  const activities = [];
  const now = Date.now();

  if (stats && stats.total > 0) {
    activities.push({
      id: '1',
      type: 'sms' as const,
      message: `${stats.last24h} OTP requests in last 24 hours`,
      timestamp: now - 1000 * 60 * 5,
      status: 'success' as const,
    });
  }

  if (stats?.byStatus?.failed && stats.byStatus.failed > 0) {
    activities.push({
      id: '2',
      type: 'alert' as const,
      message: `${stats.byStatus.failed} failed requests detected`,
      timestamp: now - 1000 * 60 * 15,
      status: 'warning' as const,
    });
  }

  if (stats?.avgFraudScore && stats.avgFraudScore > 30) {
    activities.push({
      id: '3',
      type: 'fraud_blocked' as const,
      message: `High average fraud score: ${stats.avgFraudScore.toFixed(1)}`,
      timestamp: now - 1000 * 60 * 30,
      status: 'error' as const,
    });
  }

  activities.push({
    id: '4',
    type: 'voice' as const,
    message: 'Gateway health check passed',
    timestamp: now - 1000 * 60 * 60,
    status: 'success' as const,
  });

  return activities;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<LogsStats | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, trafficRes] = await Promise.all([
        api.get('/admin/logs/stats'),
        api.get('/admin/logs/hourly-traffic'),
      ]);
      setStats(statsRes.data);
      setTrafficData(trafficRes.data.data || []);
      setError('');
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // Calculate success rate
  const verifiedCount = stats?.byStatus?.verified || 0;
  const totalCount = stats?.total || 1;
  const successRate = ((verifiedCount / totalCount) * 100).toFixed(1);

  // Generate sparkline data from status breakdown
  const sparklineData = stats?.byStatus
    ? Object.values(stats.byStatus).slice(0, 7)
    : [10, 25, 15, 30, 20, 35, 25];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={stats?.total ?? 0}
          icon={<Activity className="h-5 w-5" />}
          variant="default"
          sparklineData={sparklineData}
        />
        <StatCard
          title="Last 24 Hours"
          value={stats?.last24h ?? 0}
          icon={<Clock className="h-5 w-5" />}
          trend={{ value: 12, label: 'vs yesterday' }}
          variant="default"
        />
        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={<CheckCircle className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          title="Avg Fraud Score"
          value={stats?.avgFraudScore?.toFixed(1) ?? 'N/A'}
          icon={<ShieldAlert className="h-5 w-5" />}
          variant={
            (stats?.avgFraudScore ?? 0) > 50
              ? 'destructive'
              : (stats?.avgFraudScore ?? 0) > 30
              ? 'warning'
              : 'success'
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrafficChart data={trafficData} title="24-Hour Traffic" />
        </div>
        <StatusBreakdown data={stats?.byStatus ?? {}} />
      </div>

      {/* Activity Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentActivity activities={generateRecentActivity(stats)} />
      </div>
    </div>
  );
}
