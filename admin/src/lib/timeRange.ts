/**
 * Time Range Utilities
 *
 * Provides types and pure functions for managing time range filtering
 * across the dashboard.
 */

export type TimeRangePreset = '1h' | '24h' | '7d' | '30d' | 'custom';

export interface TimeRange {
  preset: TimeRangePreset;
  dateFrom?: number;  // Unix timestamp (ms)
  dateTo?: number;    // Unix timestamp (ms)
}

export interface TimeRangeParams {
  date_from?: number;
  date_to?: number;
  granularity?: 'hourly' | '6hourly' | 'daily';
}

/**
 * Preset durations in milliseconds
 */
const PRESET_DURATIONS: Record<Exclude<TimeRangePreset, 'custom'>, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Human-readable labels for presets
 */
export const PRESET_LABELS: Record<TimeRangePreset, string> = {
  '1h': 'Last Hour',
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  'custom': 'Custom Range',
};

/**
 * Convert time range to API query parameters
 */
export function getTimeRangeTimestamps(range: TimeRange): TimeRangeParams {
  const now = Date.now();

  if (range.preset === 'custom') {
    return {
      date_from: range.dateFrom,
      date_to: range.dateTo || now,
      granularity: getChartGranularity(range),
    };
  }

  const duration = PRESET_DURATIONS[range.preset];
  return {
    date_from: now - duration,
    date_to: now,
    granularity: getChartGranularity(range),
  };
}

/**
 * Get human-readable label for the time range
 */
export function getTimeRangeLabel(range: TimeRange): string {
  if (range.preset === 'custom' && range.dateFrom && range.dateTo) {
    const from = new Date(range.dateFrom).toLocaleDateString();
    const to = new Date(range.dateTo).toLocaleDateString();
    return `${from} - ${to}`;
  }
  return PRESET_LABELS[range.preset];
}

/**
 * Calculate chart granularity based on time range duration
 * - <= 24h: hourly (max 24 data points)
 * - <= 7d: 6-hourly (max 28 data points)
 * - > 7d: daily (max ~30 data points)
 */
export function getChartGranularity(range: TimeRange): 'hourly' | '6hourly' | 'daily' {
  let durationMs: number;

  if (range.preset === 'custom') {
    if (!range.dateFrom || !range.dateTo) return 'hourly';
    durationMs = range.dateTo - range.dateFrom;
  } else {
    durationMs = PRESET_DURATIONS[range.preset];
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  if (durationMs <= oneDayMs) return 'hourly';
  if (durationMs <= sevenDaysMs) return '6hourly';
  return 'daily';
}

/**
 * Get default time range (24 hours)
 */
export function getDefaultTimeRange(): TimeRange {
  return { preset: '24h' };
}

/**
 * Parse URL search params into TimeRange
 */
export function parseTimeRangeFromUrl(searchParams: URLSearchParams): TimeRange {
  const preset = searchParams.get('range') as TimeRangePreset | null;

  if (!preset) return getDefaultTimeRange();

  if (preset === 'custom') {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    return {
      preset: 'custom',
      dateFrom: from ? parseInt(from, 10) : undefined,
      dateTo: to ? parseInt(to, 10) : undefined,
    };
  }

  if (preset in PRESET_DURATIONS) {
    return { preset };
  }

  return getDefaultTimeRange();
}

/**
 * Serialize TimeRange to URL search params
 */
export function timeRangeToUrlParams(range: TimeRange): Record<string, string> {
  if (range.preset === 'custom') {
    const params: Record<string, string> = { range: 'custom' };
    if (range.dateFrom) params.from = String(range.dateFrom);
    if (range.dateTo) params.to = String(range.dateTo);
    return params;
  }
  return { range: range.preset };
}

/**
 * Convert Date to local datetime string for input[type="datetime-local"]
 */
export function dateToLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  // Format: YYYY-MM-DDTHH:MM
  return date.toISOString().slice(0, 16);
}

/**
 * Parse datetime-local input value to timestamp
 */
export function localInputToTimestamp(value: string): number {
  return new Date(value).getTime();
}
