import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Send, XCircle, AlertTriangle, Timer } from 'lucide-react';

type OtpStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'verified' | 'rejected' | 'expired';

interface StatusBadgeProps {
  status: OtpStatus | string;
}

const statusConfig: Record<string, {
  variant: 'default' | 'success' | 'warning' | 'destructive' | 'muted';
  icon: React.ReactNode;
  label: string;
}> = {
  pending: {
    variant: 'warning',
    icon: <Clock className="h-3 w-3" />,
    label: 'Pending',
  },
  sending: {
    variant: 'warning',
    icon: <Send className="h-3 w-3" />,
    label: 'Sending',
  },
  sent: {
    variant: 'success',
    icon: <Send className="h-3 w-3" />,
    label: 'Sent',
  },
  delivered: {
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
    label: 'Delivered',
  },
  verified: {
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
    label: 'Verified',
  },
  failed: {
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
    label: 'Failed',
  },
  rejected: {
    variant: 'destructive',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Rejected',
  },
  expired: {
    variant: 'muted',
    icon: <Timer className="h-3 w-3" />,
    label: 'Expired',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    variant: 'muted' as const,
    icon: null,
    label: status,
  };

  return (
    <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}
