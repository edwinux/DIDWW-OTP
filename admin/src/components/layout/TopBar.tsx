import { useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Activity,
  Database,
  FlaskConical,
  Wifi,
  WifiOff,
  Menu,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '@/services/api';

const routeInfo: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
  '/': {
    icon: <LayoutDashboard className="h-5 w-5" />,
    title: 'Dashboard',
    description: 'System overview and key metrics',
  },
  '/logs': {
    icon: <Activity className="h-5 w-5" />,
    title: 'Live Logs',
    description: 'Real-time OTP request monitoring',
  },
  '/database': {
    icon: <Database className="h-5 w-5" />,
    title: 'Database',
    description: 'Browse database tables and records',
  },
  '/tester': {
    icon: <FlaskConical className="h-5 w-5" />,
    title: 'Test Lab',
    description: 'Send test OTP requests and verify',
  },
};

interface TopBarProps {
  onMobileMenuOpen?: () => void;
}

export function TopBar({ onMobileMenuOpen }: TopBarProps) {
  const location = useLocation();
  const [gatewayStatus, setGatewayStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  const currentRoute = routeInfo[location.pathname] || routeInfo['/'];

  useEffect(() => {
    const checkGatewayStatus = async () => {
      try {
        const response = await api.get('/admin/health');
        setGatewayStatus(response.data.status === 'healthy' ? 'online' : 'offline');
      } catch {
        setGatewayStatus('offline');
      }
    };

    checkGatewayStatus();
    const interval = setInterval(checkGatewayStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm px-4 md:px-6 flex items-center justify-between">
      {/* Left side: hamburger + page info */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onMobileMenuOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Page Info */}
        <div className="hidden sm:block p-2 rounded-md bg-primary/10 text-primary">
          {currentRoute.icon}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">{currentRoute.title}</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">{currentRoute.description}</p>
        </div>
      </div>

      {/* Gateway Status */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm text-muted-foreground hidden sm:inline">Gateway:</span>
        <Badge
          variant={gatewayStatus === 'online' ? 'success' : gatewayStatus === 'offline' ? 'destructive' : 'muted'}
          className="flex items-center gap-1.5"
        >
          {gatewayStatus === 'online' ? (
            <>
              <Wifi className="h-3 w-3" />
              <span className="hidden xs:inline">Online</span>
              <span className={cn(
                'h-2 w-2 rounded-full bg-emerald-400 animate-pulse'
              )} />
            </>
          ) : gatewayStatus === 'offline' ? (
            <>
              <WifiOff className="h-3 w-3" />
              <span className="hidden xs:inline">Offline</span>
            </>
          ) : (
            <span>...</span>
          )}
        </Badge>
      </div>
    </header>
  );
}
