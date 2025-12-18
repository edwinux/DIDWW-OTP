import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, MessageSquare, Clock, CheckCircle, UserCheck, DollarSign } from 'lucide-react';
import type { VoiceChannelStats, SmsChannelStats } from '@/types';

interface ChannelStatsProps {
  channel: 'voice' | 'sms';
  stats: VoiceChannelStats | SmsChannelStats;
}

export function ChannelStats({ channel, stats }: ChannelStatsProps) {
  const isVoice = channel === 'voice';
  const voiceStats = stats as VoiceChannelStats;
  const smsStats = stats as SmsChannelStats;

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          {isVoice ? (
            <Phone className="h-4 w-4 text-violet-400" />
          ) : (
            <MessageSquare className="h-4 w-4 text-primary" />
          )}
          {isVoice ? 'Voice Channel' : 'SMS Channel'}
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {stats.total.toLocaleString()} total
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Delivery/Success Rate */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5" />
              {isVoice ? 'Success Rate' : 'Delivery Rate'}
            </div>
            <p className="text-2xl font-bold">
              {isVoice ? voiceStats.successRate : smsStats.deliverySuccessRate}%
            </p>
          </div>

          {/* Auth Success Rate */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" />
              Auth Rate
            </div>
            <p className="text-2xl font-bold">{stats.authSuccessRate}%</p>
          </div>

          {/* Voice: Duration, SMS: placeholder */}
          {isVoice ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Avg Duration
              </div>
              <p className="text-2xl font-bold">{formatDuration(voiceStats.avgDuration)}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                Avg Cost
              </div>
              <p className="text-2xl font-bold text-muted-foreground">Soon</p>
            </div>
          )}

          {/* Cost placeholder */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              {isVoice ? 'Avg Cost' : 'Total Cost'}
            </div>
            <p className="text-2xl font-bold text-muted-foreground">Soon</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
