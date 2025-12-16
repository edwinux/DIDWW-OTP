import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RiskScoreBarProps {
  score: number;
  showLabel?: boolean;
}

export function RiskScoreBar({ score, showLabel = true }: RiskScoreBarProps) {
  const getColor = (score: number) => {
    if (score >= 70) return 'bg-destructive';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 30) return 'bg-warning';
    return 'bg-success';
  };

  const getTextColor = (score: number) => {
    if (score >= 70) return 'text-destructive';
    if (score >= 50) return 'text-orange-500';
    if (score >= 30) return 'text-warning';
    return 'text-success';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 70) return 'High Risk';
    if (score >= 50) return 'Medium-High Risk';
    if (score >= 30) return 'Medium Risk';
    return 'Low Risk';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getColor(score))}
                style={{ width: `${Math.min(score, 100)}%` }}
              />
            </div>
            {showLabel && (
              <span className={cn('text-sm font-mono font-medium w-8', getTextColor(score))}>
                {score}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{getRiskLevel(score)}</p>
          <p className="text-xs text-muted-foreground">Fraud Score: {score}/100</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
