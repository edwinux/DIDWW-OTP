/**
 * Time Range Selector Component
 *
 * Dropdown with preset time ranges and custom date picker.
 */

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, X } from 'lucide-react';
import type { TimeRange, TimeRangePreset } from '@/lib/timeRange';
import {
  PRESET_LABELS,
  dateToLocalInput,
  localInputToTimestamp,
} from '@/lib/timeRange';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const PRESETS: TimeRangePreset[] = ['1h', '24h', '7d', '30d', 'custom'];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(value.preset === 'custom');
  const [customFrom, setCustomFrom] = useState(
    value.dateFrom ? dateToLocalInput(value.dateFrom) : ''
  );
  const [customTo, setCustomTo] = useState(
    value.dateTo ? dateToLocalInput(value.dateTo) : ''
  );

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setShowCustom(true);
      // Initialize with last 24h if no dates set
      const now = Date.now();
      const from = value.dateFrom || now - 24 * 60 * 60 * 1000;
      const to = value.dateTo || now;
      setCustomFrom(dateToLocalInput(from));
      setCustomTo(dateToLocalInput(to));
      onChange({ preset: 'custom', dateFrom: from, dateTo: to });
    } else {
      setShowCustom(false);
      onChange({ preset: preset as TimeRangePreset });
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const from = localInputToTimestamp(customFrom);
      const to = localInputToTimestamp(customTo);
      if (from <= to) {
        onChange({ preset: 'custom', dateFrom: from, dateTo: to });
      }
    }
  };

  const handleCloseCustom = () => {
    setShowCustom(false);
    onChange({ preset: '24h' });
  };

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <Select value={value.preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showCustom && (
        <div className="flex items-center gap-2 ml-2 p-2 bg-card border rounded-lg">
          <div className="flex items-center gap-2">
            <Label htmlFor="date-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="date-from"
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-[180px] h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="date-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="date-to"
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-[180px] h-8 text-sm"
            />
          </div>
          <Button size="sm" variant="default" onClick={handleCustomApply}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCloseCustom}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
