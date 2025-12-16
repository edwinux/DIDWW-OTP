import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Terminal, Trash2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConsoleEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  source: 'UI' | 'WS' | 'API' | 'FRAUD' | 'GATEWAY' | 'DLR' | 'SIP' | 'VOICE';
  message: string;
  data?: unknown;
}

interface DebugConsoleProps {
  entries: ConsoleEntry[];
  onClear: () => void;
  connected: boolean;
}

const sourceColors: Record<string, string> = {
  UI: 'text-violet-400',
  WS: 'text-blue-400',
  API: 'text-cyan-400',
  FRAUD: 'text-amber-400',
  GATEWAY: 'text-emerald-400',
  DLR: 'text-pink-400',
  SIP: 'text-orange-400',
  VOICE: 'text-purple-400',
};

const typeIcons: Record<string, string> = {
  info: '🔵',
  success: '🟢',
  warning: '🟡',
  error: '🔴',
  system: '⚪',
};

export function DebugConsole({ entries, onClear, connected }: DebugConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [entries]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card className="h-full flex flex-col bg-slate-950">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-5 w-5 text-emerald-400" />
          Live Debug Console
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={connected ? 'success' : 'muted'}
            className="flex items-center gap-1.5"
          >
            <Circle
              className={cn(
                'h-2 w-2 fill-current',
                connected && 'animate-pulse'
              )}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 pt-0 font-mono text-sm space-y-0.5">
            {entries.length === 0 ? (
              <div className="text-muted-foreground text-center py-8">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Waiting for events...</p>
                <p className="text-xs mt-1">Send an OTP to see live debug output</p>
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-900/50',
                    entry.type === 'error' && 'bg-destructive/5'
                  )}
                >
                  {/* Timestamp */}
                  <span className="text-muted-foreground shrink-0 text-xs">
                    [{formatTime(entry.timestamp)}]
                  </span>

                  {/* Type Icon */}
                  <span className="shrink-0">{typeIcons[entry.type]}</span>

                  {/* Source Badge */}
                  <span
                    className={cn(
                      'shrink-0 font-semibold text-xs',
                      sourceColors[entry.source] || 'text-muted-foreground'
                    )}
                  >
                    {entry.source}:
                  </span>

                  {/* Message */}
                  <span
                    className={cn(
                      'flex-1',
                      entry.type === 'error' && 'text-destructive',
                      entry.type === 'success' && 'text-emerald-400',
                      entry.type === 'warning' && 'text-amber-400',
                      entry.type === 'system' && 'text-muted-foreground italic'
                    )}
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}

            {/* Blinking cursor */}
            {entries.length > 0 && (
              <div className="flex items-center gap-2 py-1 px-2">
                <span className="text-emerald-400 animate-pulse">█</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
