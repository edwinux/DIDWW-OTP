import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/services/api';
import type { LogsStats } from '@/types';
import { StatCard, TrafficChart, StatusBreakdown, ChannelStats, EventList, TimeRangeSelector } from '@/components/dashboard';
import { Activity, CheckCircle, ShieldBan } from 'lucide-react';
import type { TimeRange } from '@/lib/timeRange';
import {
  getTimeRangeTimestamps,
  getTimeRangeLabel,
  parseTimeRangeFromUrl,
  timeRangeToUrlParams,
} from '@/lib/timeRange';

interface TrafficDataPoint {
  time: string;
  requests: number;
  verified: number;
  failed: number;
  banned: number;
}

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<LogsStats | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Initialize time range from URL or default to 24h
  const [timeRange, setTimeRange] = useState<TimeRange>(() =>
    parseTimeRangeFromUrl(searchParams)
  );

  // Update URL when time range changes
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
    setSearchParams(timeRangeToUrlParams(range));
  }, [setSearchParams]);

  const fetchData = useCallback(async () => {
    try {
      const params = getTimeRangeTimestamps(timeRange);
      const queryParams = new URLSearchParams();
      if (params.date_from) queryParams.set('date_from', String(params.date_from));
      if (params.date_to) queryParams.set('date_to', String(params.date_to));
      if (params.granularity) queryParams.set('granularity', params.granularity);

      const queryString = queryParams.toString();
      const [statsRes, trafficRes] = await Promise.all([
        api.get(`/admin/logs/stats${queryString ? `?${queryString}` : ''}`),
        api.get(`/admin/logs/hourly-traffic${queryString ? `?${queryString}` : ''}`),
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
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  // Get dynamic label for time range
  const timeRangeLabel = getTimeRangeLabel(timeRange);

  // Build trend props for each stat card
  const buildTrendProp = (change: number | null) =>
    change !== null ? { value: change, label: 'vs prev period' } : undefined;

  return (
    <div className="space-y-6">
      {/* Header with Time Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
      </div>

      {/* KPI Cards - Total, Verified, Banned with period comparison */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={`Total (${timeRangeLabel})`}
          value={stats?.periodStats?.total.current ?? 0}
          icon={<Activity className="h-5 w-5" />}
          trend={buildTrendProp(stats?.periodStats?.total.change ?? null)}
          variant="default"
        />
        <StatCard
          title="Verified"
          value={stats?.periodStats?.verified.current ?? 0}
          icon={<CheckCircle className="h-5 w-5" />}
          trend={buildTrendProp(stats?.periodStats?.verified.change ?? null)}
          variant="success"
        />
        <StatCard
          title="Banned"
          value={stats?.periodStats?.banned.current ?? 0}
          icon={<ShieldBan className="h-5 w-5" />}
          trend={buildTrendProp(stats?.periodStats?.banned.change ?? null)}
          variant="destructive"
        />
      </div>

      {/* Channel Stats Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChannelStats
          channel="voice"
          stats={stats?.voice ?? { total: 0, avgDuration: null, successRate: 0, authSuccessRate: 0, avgCost: null }}
        />
        <ChannelStats
          channel="sms"
          stats={stats?.sms ?? { total: 0, deliverySuccessRate: 0, authSuccessRate: 0, avgCost: null, totalCost: null }}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrafficChart data={trafficData} title={`${timeRangeLabel} Traffic`} />
        </div>
        <StatusBreakdown data={stats?.byStatus ?? {}} />
      </div>

      {/* Events Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <EventList
          title="Verified"
          events={stats?.recentVerified ?? []}
          variant="verified"
          emptyMessage="No verified OTPs yet"
        />
        <EventList
          title="Failed"
          events={stats?.recentFailed ?? []}
          variant="failed"
          emptyMessage="No failed requests"
        />
        <EventList
          title="Banned"
          events={stats?.recentBanned ?? []}
          variant="banned"
          emptyMessage="No banned requests"
        />
      </div>
    </div>
  );
}
