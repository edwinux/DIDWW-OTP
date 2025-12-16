import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  sparklineData?: number[];
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

const variantStyles = {
  default: {
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    sparklineColor: 'hsl(262.1, 83.3%, 57.8%)',
  },
  success: {
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    sparklineColor: 'hsl(160, 84%, 39%)',
  },
  warning: {
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    sparklineColor: 'hsl(38, 92%, 50%)',
  },
  destructive: {
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    sparklineColor: 'hsl(0, 62.8%, 50.6%)',
  },
};

export function StatCard({
  title,
  value,
  icon,
  trend,
  sparklineData,
  variant = 'default',
}: StatCardProps) {
  const styles = variantStyles[variant];
  const chartData = sparklineData?.map((v, i) => ({ value: v, index: i })) || [];

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {trend && (
              <div className="flex items-center gap-1 text-sm">
                {trend.value > 0 ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : trend.value < 0 ? (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                ) : (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    trend.value > 0 && 'text-success',
                    trend.value < 0 && 'text-destructive',
                    trend.value === 0 && 'text-muted-foreground'
                  )}
                >
                  {trend.value > 0 ? '+' : ''}
                  {trend.value}%
                </span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', styles.iconBg, styles.iconColor)}>
            {icon}
          </div>
        </div>

        {/* Sparkline Chart */}
        {sparklineData && sparklineData.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-16 opacity-50">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${variant}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={styles.sparklineColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={styles.sparklineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={styles.sparklineColor}
                  strokeWidth={2}
                  fill={`url(#gradient-${variant})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
