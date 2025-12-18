import { X, Phone, MessageSquare, Shield, ShieldOff, Clock, MapPin, Globe, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from './StatusBadge';
import { RiskScoreBar } from './RiskScoreBar';
import type { OtpRequest } from '@/types';
import { cn } from '@/lib/utils';

interface LogDetailDrawerProps {
  log: OtpRequest | null;
  onClose: () => void;
}

export function LogDetailDrawer({ log, onClose }: LogDetailDrawerProps) {
  if (!log) return null;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={cn(
        'fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border z-50',
        'animate-in slide-in-from-right duration-300'
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold">Request Details</h2>
              <p className="text-sm text-muted-foreground font-mono">{log.id}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Status & Risk Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={log.status} />
                    {log.shadow_banned === 1 && (
                      <Badge variant="destructive" className="text-xs">
                        <ShieldOff className="h-3 w-3 mr-1" />
                        Banned
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Auth Status</p>
                  {log.auth_status ? (
                    <Badge variant={log.auth_status === 'verified' ? 'default' : 'secondary'} className="gap-1">
                      {log.auth_status === 'verified' ? (
                        <><CheckCircle className="h-3 w-3" /> Verified</>
                      ) : (
                        <><XCircle className="h-3 w-3" /> Wrong Code</>
                      )}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not verified</span>
                  )}
                </div>
              </div>

              {/* Fraud Score */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Fraud Score</p>
                <RiskScoreBar score={log.fraud_score} />
              </div>

              <Separator />

              {/* Contact Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Phone Number</p>
                    <p className="font-mono font-medium">{log.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Channel</p>
                    <Badge variant="outline" className="mt-1">
                      {log.channel === 'sms' ? (
                        <><MessageSquare className="h-3 w-3 mr-1" /> SMS</>
                      ) : log.channel === 'voice' ? (
                        <><Phone className="h-3 w-3 mr-1" /> Voice</>
                      ) : (
                        log.channel || 'N/A'
                      )}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Location Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Location & Network
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Country</p>
                    <p className="font-medium">{log.country_code || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IP Address</p>
                    <p className="font-mono">{log.ip_address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IP Subnet</p>
                    <p className="font-mono">{log.ip_subnet || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ASN</p>
                    <p className="font-mono">{log.asn || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Timing Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Timing
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-mono">{formatDate(log.created_at)}</span>
                  </div>
                  {log.updated_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated</span>
                      <span className="font-mono">{formatDate(log.updated_at)}</span>
                    </div>
                  )}
                  {log.expires_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires</span>
                      <span className="font-mono">{formatDate(log.expires_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {log.error_message && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Error Details
                    </h3>
                    <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                      <p className="text-sm text-destructive font-mono">{log.error_message}</p>
                    </div>
                  </div>
                </>
              )}

              {/* Raw Data */}
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Raw Data
                </h3>
                <pre className="p-3 rounded-md bg-muted text-xs font-mono overflow-auto max-h-48">
                  {JSON.stringify(log, null, 2)}
                </pre>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
