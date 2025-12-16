export interface OtpRequest {
  id: number;
  request_id: string;
  phone_number: string;
  otp_code: string;
  status: 'pending' | 'calling' | 'answered' | 'completed' | 'failed' | 'verified' | 'expired';
  channel_id?: string;
  call_duration?: number;
  asterisk_call_id?: string;
  caller_id?: string;
  voice_speed?: number;
  repeat_count?: number;
  language?: string;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
  verified_at?: string;
  expires_at?: string;
  failure_reason?: string;
  client_ip?: string;
  fraud_score?: number;
  fraud_flags?: string;
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

export interface LogsStats {
  total: number;
  byStatus: Record<string, number>;
  last24h: number;
  avgFraudScore: number;
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
