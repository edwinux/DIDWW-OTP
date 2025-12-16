import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Activity,
  Database,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard', end: true },
  { to: '/logs', icon: <Activity className="h-5 w-5" />, label: 'Live Logs' },
  { to: '/database', icon: <Database className="h-5 w-5" />, label: 'Database' },
  { to: '/tester', icon: <FlaskConical className="h-5 w-5" />, label: 'Test Lab' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-screen bg-card border-r border-border transition-all duration-300',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo/Brand */}
        <div className="flex items-center h-16 px-4 border-b border-border">
          <Shield className="h-8 w-8 text-primary shrink-0" />
          {!collapsed && (
            <span className="ml-3 font-semibold text-lg text-foreground whitespace-nowrap">
              OTP Gateway
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive
                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                        : 'text-muted-foreground',
                      collapsed && 'justify-center px-2'
                    )
                  }
                >
                  {item.icon}
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" className="font-medium">
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border space-y-2">
          {/* Collapse Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('w-full', collapsed && 'px-2')}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className={cn(
                  'w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                  collapsed && 'px-2'
                )}
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && <span className="ml-2">Logout</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Logout</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
