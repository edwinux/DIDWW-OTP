export interface OtpRequest {
  id: string;
  session_id: string | null;
  phone: string;
  phone_prefix: string | null;
  code_hash: string | null;
  status: 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'verified' | 'rejected' | 'expired';
  channel: string | null;
  channel_status: string | null;
  auth_status: 'verified' | 'wrong_code' | null;
  channels_requested: string | null;
  ip_address: string | null;
  ip_subnet: string | null;
  asn: number | null;
  country_code: string | null;
  phone_country: string | null;
  fraud_score: number;
  fraud_reasons: string | null;
  shadow_banned: number;
  webhook_url: string | null;
  provider_id: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  // V5: Voice call timing columns
  start_time: number | null;
  answer_time: number | null;
  end_time: number | null;
}

export interface WebhookLog {
  id: number;
  otp_request_id: number;
  request_id: string;
  event_type: string;
  webhook_url: string;
  payload: string;
  response_status?: number;
  response_body?: string;
  success: number;
  attempt_number: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface VoiceChannelStats {
  total: number;
  avgDuration: number | null;      // seconds
  successRate: number;             // % delivered/answered
  authSuccessRate: number;         // % verified
  avgCost: number | null;          // placeholder for future
}

export interface SmsChannelStats {
  total: number;
  deliverySuccessRate: number;     // % delivered
  authSuccessRate: number;         // % verified
  avgCost: number | null;          // placeholder for future
}

export interface LogsStats {
  total: number;
  byStatus: Record<string, number>;
  last24h: number;
  trend: number | null;            // % change vs previous 24h
  avgFraudScore: number;
  // Channel-specific stats
  voice: VoiceChannelStats;
  sms: SmsChannelStats;
  // Recent events
  recentVerified: OtpRequest[];
  recentFailed: OtpRequest[];
  recentBanned: OtpRequest[];
}

export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface TableSchema {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface FilterValues {
  statuses: string[];
  languages: string[];
}

export interface TestOtpRequest {
  phone_number: string;
  caller_id?: string;
  voice_speed?: number;
  repeat_count?: number;
  language?: string;
}

export interface TestOtpResponse {
  success: boolean;
  data?: {
    requestId: string;
    phoneNumber: string;
    otpCode: string;
    status: string;
    expiresAt: string;
  };
  error?: string;
}

export interface CallerIdRoute {
  id: number;
  channel: 'sms' | 'voice';
  prefix: string;
  caller_id: string;
  description: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface CallerIdRoutesResponse {
  data: CallerIdRoute[];
  meta: {
    total: number;
    sms: number;
    voice: number;
  };
}

export interface CallerIdTestResult {
  phone: string;
  sms: { prefix: string; callerId: string } | null;
  voice: { prefix: string; callerId: string } | null;
}
