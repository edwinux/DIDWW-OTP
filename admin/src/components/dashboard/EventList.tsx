import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, MessageSquare, CheckCircle, XCircle, ShieldOff } from 'lucide-react';
import type { OtpRequest } from '@/types';

interface EventListProps {
  title: string;
  events: OtpRequest[];
  variant: 'verified' | 'failed' | 'banned';
  emptyMessage?: string;
}

const variantConfig = {
  verified: {
    icon: CheckCircle,
    iconColor: 'text-success',
    badgeVariant: 'success' as const,
  },
  failed: {
    icon: XCircle,
    iconColor: 'text-destructive',
    badgeVariant: 'destructive' as const,
  },
  banned: {
    icon: ShieldOff,
    iconColor: 'text-warning',
    badgeVariant: 'warning' as const,
  },
};

export function EventList({ title, events, variant, emptyMessage = 'No events' }: EventListProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const maskPhone = (phone: string) => {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 3) + '***' + phone.slice(-3);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.iconColor}`} />
          {title}
          {events.length > 0 && (
            <Badge variant={config.badgeVariant} className="ml-auto text-xs">
              {events.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[200px]">
          <div className="space-y-1 p-4 pt-0">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="p-1.5 rounded-md bg-muted">
                  {event.channel === 'sms' ? (
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Phone className="h-3.5 w-3.5 text-violet-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{maskPhone(event.phone)}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.country_code || 'Unknown'} · {formatTime(event.created_at)}
                  </p>
                </div>
                {variant === 'failed' && event.error_message && (
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={event.error_message}>
                    {event.error_message.slice(0, 20)}...
                  </span>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {emptyMessage}
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
