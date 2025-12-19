import { useState, useEffect, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import api from '@/services/api';
import type { OtpRequest, PaginatedResponse, FilterValues } from '@/types';
import { DataTable, StatusBadge, RiskScoreBar, LogDetailDrawer } from '@/components/logs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, Phone, MessageSquare, RefreshCw, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const columns: ColumnDef<OtpRequest>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.id.substring(0, 8)}...
      </span>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="font-mono">{row.original.phone}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.shadow_banned === 1 ? (
          <Badge variant="destructive" className="text-xs px-1.5 py-0">
            <ShieldOff className="h-3 w-3 mr-0.5" />
            Banned
          </Badge>
        ) : (
          <StatusBadge status={row.original.status} />
        )}
      </div>
    ),
  },
  {
    accessorKey: 'auth_status',
    header: 'Auth',
    cell: ({ row }) => {
      const authStatus = row.original.auth_status;
      if (!authStatus) return <span className="text-muted-foreground text-xs">-</span>;
      return (
        <Badge variant={authStatus === 'verified' ? 'default' : 'secondary'} className="text-xs">
          {authStatus === 'verified' ? 'Verified' : 'Wrong Code'}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'channel',
    header: 'Channel',
    cell: ({ row }) => {
      const channel = row.original.channel;
      if (!channel) return <span className="text-muted-foreground">-</span>;
      return (
        <div className="flex items-center gap-1.5 text-sm">
          {channel === 'sms' ? (
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Phone className="h-3.5 w-3.5 text-violet-400" />
          )}
          <span className="capitalize">{channel}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'fraud_score',
    header: 'Risk Score',
    cell: ({ row }) => <RiskScoreBar score={row.original.fraud_score} />,
  },
  {
    accessorKey: 'country_code',
    header: 'Country',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.country_code || '-'}</span>
    ),
  },
  {
    accessorKey: 'cost',
    header: 'Cost',
    cell: ({ row }) => {
      const smsCost = row.original.sms_cost_units;
      const voiceCost = row.original.voice_cost_units;
      const cost = smsCost ?? voiceCost;
      if (cost === null || cost === undefined) {
        return <span className="text-muted-foreground text-xs">-</span>;
      }
      // Convert from 1/10000 dollars to USD
      const costUsd = cost / 10000;
      return <span className="font-mono text-xs">${costUsd.toFixed(4)}</span>;
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.original.created_at).toLocaleString()}
      </span>
    ),
  },
];

export default function LogsPage() {
  const [logs, setLogs] = useState<OtpRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ status: '', phone: '', id: '' });
  const [filterValues, setFilterValues] = useState<FilterValues>({ statuses: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<OtpRequest | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.phone) params.set('phone', filters.phone);
      if (filters.id) params.set('id', filters.id);

      const response = await api.get<PaginatedResponse<OtpRequest>>(`/admin/logs/otp-requests?${params}`);
      setLogs(response.data.data);
      setPagination(response.data.pagination);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    api.get<FilterValues>('/admin/logs/filters').then(res => setFilterValues(res.data));
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => handleFilterChange('status', value)}
              >
                <SelectTrigger id="status-filter" className="w-[150px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterValues.statuses.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone-filter">Phone Number</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone-filter"
                  placeholder="Filter by phone..."
                  className="pl-9 w-[180px]"
                  value={filters.phone}
                  onChange={(e) => handleFilterChange('phone', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="id-filter">Request ID</Label>
              <Input
                id="id-filter"
                placeholder="Filter by ID..."
                className="w-[180px] font-mono"
                value={filters.id}
                onChange={(e) => handleFilterChange('id', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit-select">Per Page</Label>
              <Select
                value={pagination.limit.toString()}
                onValueChange={(value) => setPagination(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
              >
                <SelectTrigger id="limit-select" className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={logs}
              onRowClick={(row) => setSelectedLog(row)}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startRecord} to {endRecord} of {pagination.total} entries
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Detail Drawer */}
      <LogDetailDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
