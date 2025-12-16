import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBreakdownProps {
  data: Record<string, number>;
}

const statusConfig: Record<string, { variant: 'default' | 'success' | 'warning' | 'destructive' | 'muted'; label: string }> = {
  verified: { variant: 'success', label: 'Verified' },
  delivered: { variant: 'success', label: 'Delivered' },
  sent: { variant: 'success', label: 'Sent' },
  pending: { variant: 'warning', label: 'Pending' },
  sending: { variant: 'warning', label: 'Sending' },
  failed: { variant: 'destructive', label: 'Failed' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  expired: { variant: 'muted', label: 'Expired' },
};

export function StatusBreakdown({ data }: StatusBreakdownProps) {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0);

  // Sort by count descending
  const sortedEntries = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Status Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedEntries.map(([status, count]) => {
          const config = statusConfig[status] || { variant: 'muted' as const, label: status };
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant={config.variant} className="text-xs">
                  {config.label}
                </Badge>
                <span className="text-sm font-medium text-foreground">
                  {count.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    config.variant === 'success' && 'bg-success',
                    config.variant === 'warning' && 'bg-warning',
                    config.variant === 'destructive' && 'bg-destructive',
                    config.variant === 'muted' && 'bg-muted-foreground',
                    config.variant === 'default' && 'bg-primary'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
        {sortedEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
