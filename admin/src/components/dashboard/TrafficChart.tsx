import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrafficDataPoint {
  time: string;
  requests: number;
  verified: number;
  failed: number;
}

interface TrafficChartProps {
  data: TrafficDataPoint[];
  title?: string;
}

export function TrafficChart({ data, title = 'Traffic Overview' }: TrafficChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262.1, 83.3%, 57.8%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(262.1, 83.3%, 57.8%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 62.8%, 50.6%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0, 62.8%, 50.6%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(217.2, 32.6%, 17.5%)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                stroke="hsl(215, 20.2%, 65.1%)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(215, 20.2%, 65.1%)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(222.2, 84%, 6%)',
                  border: '1px solid hsl(217.2, 32.6%, 17.5%)',
                  borderRadius: '8px',
                  color: 'hsl(210, 40%, 98%)',
                }}
                labelStyle={{ color: 'hsl(215, 20.2%, 65.1%)' }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                name="Requests"
                stroke="hsl(262.1, 83.3%, 57.8%)"
                strokeWidth={2}
                fill="url(#colorRequests)"
              />
              <Area
                type="monotone"
                dataKey="verified"
                name="Verified"
                stroke="hsl(160, 84%, 39%)"
                strokeWidth={2}
                fill="url(#colorVerified)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="hsl(0, 62.8%, 50.6%)"
                strokeWidth={2}
                fill="url(#colorFailed)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">Requests</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-muted-foreground">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="text-muted-foreground">Failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
