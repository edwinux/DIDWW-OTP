import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Activity,
  Database,
  FlaskConical,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  GitCommit,
  X,
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
  { to: '/settings', icon: <Settings className="h-5 w-5" />, label: 'Settings' },
];

interface SidebarProps {
  mobileMenuOpen?: boolean;
  onMobileMenuClose?: () => void;
}

export function Sidebar({ mobileMenuOpen = false, onMobileMenuClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [version, setVersion] = useState<{ commit: string; buildTime: string | null } | null>(null);
  const { logout } = useAuth();
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    onMobileMenuClose?.();
  }, [location.pathname]);

  useEffect(() => {
    fetch('/admin/version')
      .then(res => res.json())
      .then(data => setVersion(data))
      .catch(() => setVersion({ commit: 'unknown', buildTime: null }));
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onMobileMenuClose}
        />
      )}

      <aside
        className={cn(
          'flex flex-col h-screen bg-card border-r border-border transition-all duration-300',
          // Desktop: normal sidebar behavior
          'hidden md:flex',
          collapsed ? 'w-16' : 'w-60',
          // Mobile: fixed overlay when open
          mobileMenuOpen && 'fixed inset-y-0 left-0 z-50 flex w-60'
        )}
      >
        {/* Logo/Brand */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-primary shrink-0" />
            {!collapsed && (
              <span className="ml-3 font-semibold text-lg text-foreground whitespace-nowrap">
                OTP Gateway
              </span>
            )}
          </div>
          {/* Mobile close button */}
          {mobileMenuOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onMobileMenuClose}
            >
              <X className="h-5 w-5" />
            </Button>
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
                      'block px-3 py-2.5 rounded-md transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive
                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                        : 'text-muted-foreground',
                      collapsed && 'px-2'
                    )
                  }
                >
                  <span className={cn(
                    'flex items-center gap-3',
                    collapsed && 'justify-center'
                  )}>
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                  </span>
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

          {/* Version Info */}
          {version && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground/60',
                  collapsed && 'justify-center px-2'
                )}>
                  <GitCommit className="h-3 w-3 shrink-0" />
                  {!collapsed && (
                    <span className="font-mono truncate">
                      {version.commit === 'dev' ? 'dev' : version.commit.slice(0, 7)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <div>Commit: {version.commit}</div>
                  {version.buildTime && <div>Built: {new Date(version.buildTime).toLocaleString()}</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
