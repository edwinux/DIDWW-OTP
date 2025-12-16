import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, MessageSquare, Shield, AlertTriangle } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'sms' | 'voice' | 'fraud_blocked' | 'alert';
  message: string;
  timestamp: number;
  status?: 'success' | 'warning' | 'error';
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

const typeIcons = {
  sms: <MessageSquare className="h-4 w-4" />,
  voice: <Phone className="h-4 w-4" />,
  fraud_blocked: <Shield className="h-4 w-4" />,
  alert: <AlertTriangle className="h-4 w-4" />,
};

const typeColors = {
  sms: 'bg-primary/10 text-primary',
  voice: 'bg-violet-500/10 text-violet-400',
  fraud_blocked: 'bg-destructive/10 text-destructive',
  alert: 'bg-warning/10 text-warning',
};

export function RecentActivity({ activities }: RecentActivityProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-1 p-4 pt-0">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className={`p-2 rounded-md ${typeColors[activity.type]}`}>
                  {typeIcons[activity.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{activity.message}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatTime(activity.timestamp)}
                  </p>
                </div>
                {activity.status && (
                  <Badge
                    variant={
                      activity.status === 'success'
                        ? 'success'
                        : activity.status === 'warning'
                        ? 'warning'
                        : 'destructive'
                    }
                    className="text-xs shrink-0"
                  >
                    {activity.status}
                  </Badge>
                )}
              </div>
            ))}
            {activities.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent activity
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
