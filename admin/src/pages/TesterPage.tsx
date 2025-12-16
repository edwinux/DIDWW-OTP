import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import type { TestOtpResponse, OtpRequest } from '../types';

interface StatusUpdate {
  type: string;
  data: OtpRequest;
}

export default function TesterPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callerId, setCallerId] = useState('');
  const [voiceSpeed, setVoiceSpeed] = useState('1.0');
  const [repeatCount, setRepeatCount] = useState('2');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRequest, setActiveRequest] = useState<TestOtpResponse['data'] | null>(null);
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/admin/ws`;

      console.log('[WS] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected, subscribing to otp-requests channel');
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'otp-requests' }));
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WS] Message received:', message);

          // Listen for otp-request:updated or otp-request:created events
          if (message.type === 'otp-request:updated' || message.type === 'otp-request:created') {
            console.log('[WS] OTP update for:', message.data.id, 'status:', message.data.status);
            setStatusUpdates(prev => [...prev, { type: 'status', data: message.data }]);
            if (['delivered', 'failed', 'verified', 'expired', 'rejected'].includes(message.data.status)) {
              console.log('[WS] Final status reached, closing connection');
              ws.close();
            }
          }
        } catch (err) {
          console.error('[WS] Message parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        reject(err);
      };

      ws.onclose = () => {
        console.log('[WS] Connection closed');
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('[WS] Connection timeout');
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setActiveRequest(null);
    setStatusUpdates([]);
    setVerifyResult(null);
    setVerifyCode('');
    setLoading(true);

    try {
      // Connect WebSocket FIRST, before sending OTP
      console.log('[Test] Connecting WebSocket before sending OTP...');
      await connectWebSocket();
      console.log('[Test] WebSocket ready, sending OTP request...');

      const response = await api.post<TestOtpResponse>('/admin/test/send-otp', {
        phone_number: phoneNumber,
        caller_id: callerId || undefined,
        voice_speed: parseFloat(voiceSpeed),
        repeat_count: parseInt(repeatCount),
        language,
      });

      console.log('[Test] OTP response:', response.data);

      if (response.data.success && response.data.data) {
        setActiveRequest(response.data.data);
        console.log('[Test] Waiting for status updates for requestId:', response.data.data.requestId);
      } else {
        setError(response.data.error || 'Failed to send OTP');
        wsRef.current?.close();
      }
    } catch (err) {
      console.error('[Test] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
      wsRef.current?.close();
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!activeRequest) return;

    try {
      const response = await api.post(`/admin/test/verify/${activeRequest.requestId}`, {
        code: verifyCode,
      });
      setVerifyResult({
        success: response.data.success,
        message: response.data.success ? 'OTP verified successfully!' : (response.data.error || 'Verification failed'),
      });
    } catch (err) {
      setVerifyResult({
        success: false,
        message: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'badge-warning',
      sending: 'badge-info',
      sent: 'badge-success',
      delivered: 'badge-success',
      verified: 'badge-success',
      failed: 'badge-error',
      rejected: 'badge-error',
      expired: 'badge-gray',
    };
    return colors[status] || 'badge-gray';
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>UX Tester</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Send Test OTP</h3>
          </div>

          <form onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Caller ID (optional)</label>
              <input
                type="tel"
                className="form-input"
                placeholder="Leave empty for default"
                value={callerId}
                onChange={(e) => setCallerId(e.target.value)}
                disabled={loading}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Voice Speed</label>
                <select
                  className="form-select"
                  value={voiceSpeed}
                  onChange={(e) => setVoiceSpeed(e.target.value)}
                  disabled={loading}
                >
                  <option value="0.8">0.8x (Slow)</option>
                  <option value="1.0">1.0x (Normal)</option>
                  <option value="1.2">1.2x (Fast)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Repeat Count</label>
                <select
                  className="form-select"
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(e.target.value)}
                  disabled={loading}
                >
                  <option value="1">1 time</option>
                  <option value="2">2 times</option>
                  <option value="3">3 times</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Language</label>
                <select
                  className="form-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Sending...' : 'Send Test OTP'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Live Status</h3>
          </div>

          {!activeRequest ? (
            <div className="text-gray text-center" style={{ padding: '2rem' }}>
              Send a test OTP to see live status updates
            </div>
          ) : (
            <div>
              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="stat-label">Request ID</div>
                  <div className="text-sm" style={{ fontFamily: 'monospace' }}>
                    {activeRequest.requestId.substring(0, 12)}...
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">OTP Code</div>
                  <div className="stat-value">{activeRequest.otpCode}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Current Status</div>
                  <div>
                    <span className={`badge ${getStatusColor(statusUpdates.length > 0 ? statusUpdates[statusUpdates.length - 1].data.status : activeRequest.status)}`}>
                      {statusUpdates.length > 0 ? statusUpdates[statusUpdates.length - 1].data.status : activeRequest.status}
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Expires At</div>
                  <div className="text-sm">{new Date(activeRequest.expiresAt).toLocaleTimeString()}</div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <h4 className="text-sm" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Status Timeline</h4>
                <div style={{ maxHeight: '200px', overflow: 'auto', background: 'var(--gray-50)', borderRadius: '0.375rem', padding: '0.5rem' }}>
                  {statusUpdates.length === 0 ? (
                    <div className="text-gray text-sm">Waiting for updates...</div>
                  ) : (
                    statusUpdates.map((update, idx) => (
                      <div key={idx} className="text-sm" style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--gray-200)' }}>
                        <span className={`badge ${getStatusColor(update.data.status)}`} style={{ marginRight: '0.5rem' }}>
                          {update.data.status}
                        </span>
                        <span className="text-gray">
                          {new Date(update.data.updated_at).toLocaleTimeString()}
                        </span>
                        {update.data.error_message && (
                          <span className="text-error" style={{ marginLeft: '0.5rem' }}>
                            {update.data.error_message}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>
                <h4 className="text-sm" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Verify OTP</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter OTP code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={6}
                  />
                  <button className="btn btn-primary" onClick={handleVerify} disabled={!verifyCode}>
                    Verify
                  </button>
                </div>
                {verifyResult && (
                  <div className={`mt-2 text-sm ${verifyResult.success ? 'text-success' : 'text-error'}`}>
                    {verifyResult.message}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
