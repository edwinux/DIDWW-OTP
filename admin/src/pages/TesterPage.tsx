import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/services/api';
import type { TestOtpResponse, OtpRequest } from '@/types';
import { UserSimulator, DebugConsole, type ConsoleEntry } from '@/components/tester';

export default function TesterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRequest, setActiveRequest] = useState<TestOtpResponse['data'] | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const entryIdRef = useRef(0);

  // Helper to add console entries
  const addConsoleEntry = useCallback((
    type: ConsoleEntry['type'],
    source: ConsoleEntry['source'],
    message: string,
    data?: unknown
  ) => {
    const entry: ConsoleEntry = {
      id: `entry-${entryIdRef.current++}`,
      timestamp: new Date(),
      type,
      source,
      message,
      data,
    };
    setConsoleEntries(prev => [...prev, entry]);
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/admin/ws`;

      addConsoleEntry('info', 'WS', `Connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to WebSocket');
        addConsoleEntry('success', 'WS', 'Connected to WebSocket');
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'otp-requests' }));
        console.log('[WS] Subscribed to otp-requests channel');
        addConsoleEntry('info', 'WS', 'Subscribed to otp-requests channel');
        setWsConnected(true);
        resolve(ws);
      };

      ws.onmessage = (event) => {
        console.log('[WS] Message received:', event.data);
        try {
          const message = JSON.parse(event.data);
          console.log('[WS] Parsed message:', message);

          if (message.type === 'otp-request:updated' || message.type === 'otp-request:created') {
            const data = message.data as OtpRequest;
            const statusType = getStatusType(data.status);
            console.log('[WS] OTP status update:', data.status, data);

            // Add status update to console
            addConsoleEntry(
              statusType,
              getSourceForStatus(data.status, data.channel),
              formatStatusMessage(data.status, data.channel, data.error_message),
              data
            );

            // Close WebSocket on final status
            if (['delivered', 'failed', 'verified', 'expired', 'rejected'].includes(data.status)) {
              console.log('[WS] Final status reached, closing connection');
              addConsoleEntry('system', 'WS', 'Final status reached, closing connection');
              ws.close();
            }
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
          addConsoleEntry('error', 'WS', `Parse error: ${err}`);
        }
      };

      ws.onerror = (event) => {
        console.error('[WS] Connection error:', event);
        addConsoleEntry('error', 'WS', 'Connection error');
        reject(new Error('WebSocket error'));
      };

      ws.onclose = (event) => {
        console.log('[WS] Connection closed:', event.code, event.reason);
        addConsoleEntry('system', 'WS', 'Connection closed');
        setWsConnected(false);
      };

      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          addConsoleEntry('error', 'WS', 'Connection timeout');
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }, [addConsoleEntry]);

  const handleSendOtp = async (config: {
    phoneNumber: string;
    callerId: string;
    voiceSpeed: string;
    repeatCount: string;
    language: string;
    channel: string;
  }) => {
    setError('');
    setActiveRequest(null);
    setVerifyResult(null);
    setLoading(true);

    addConsoleEntry('info', 'UI', `OTP requested for ${config.phoneNumber}`);

    try {
      // Connect WebSocket FIRST
      await connectWebSocket();

      addConsoleEntry('info', 'API', 'Sending OTP request to gateway...');

      const response = await api.post<TestOtpResponse>('/admin/test/send-otp', {
        phone_number: config.phoneNumber,
        caller_id: config.callerId || undefined,
        voice_speed: parseFloat(config.voiceSpeed),
        repeat_count: parseInt(config.repeatCount),
        language: config.language,
        channel: config.channel,
      });

      if (response.data.success && response.data.data) {
        setActiveRequest(response.data.data);
        addConsoleEntry(
          'success',
          'API',
          `OTP created: ${response.data.data.requestId.substring(0, 8)}... Code: ${response.data.data.otpCode}`
        );
      } else {
        setError(response.data.error || 'Failed to send OTP');
        addConsoleEntry('error', 'API', response.data.error || 'Failed to send OTP');
        wsRef.current?.close();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      setError(message);
      addConsoleEntry('error', 'API', message);
      wsRef.current?.close();
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (!activeRequest) return;

    addConsoleEntry('info', 'UI', `Verifying code: ${code}`);

    try {
      const response = await api.post(`/admin/test/verify/${activeRequest.requestId}`, {
        code,
      });

      const success = response.data.success;
      const message = success ? 'OTP verified successfully!' : (response.data.error || 'Verification failed');

      setVerifyResult({ success, message });
      addConsoleEntry(
        success ? 'success' : 'error',
        'API',
        message
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setVerifyResult({ success: false, message });
      addConsoleEntry('error', 'API', message);
    }
  };

  const handleClearConsole = () => {
    setConsoleEntries([]);
    entryIdRef.current = 0;
  };

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Panel - User Simulator */}
      <UserSimulator
        onSendOtp={handleSendOtp}
        onVerify={handleVerify}
        activeRequest={activeRequest ?? null}
        loading={loading}
        verifyResult={verifyResult}
        error={error}
      />

      {/* Right Panel - Debug Console */}
      <DebugConsole
        entries={consoleEntries}
        onClear={handleClearConsole}
        connected={wsConnected}
      />
    </div>
  );
}

// Helper functions
function getStatusType(status: string): ConsoleEntry['type'] {
  switch (status) {
    case 'verified':
    case 'delivered':
    case 'sent':
      return 'success';
    case 'failed':
    case 'rejected':
      return 'error';
    case 'expired':
      return 'warning';
    default:
      return 'info';
  }
}

function getSourceForStatus(status: string, channel: string | null): ConsoleEntry['source'] {
  if (status === 'sending' || status === 'sent') {
    return channel === 'voice' ? 'VOICE' : 'GATEWAY';
  }
  if (status === 'delivered') {
    return 'DLR';
  }
  if (status === 'rejected') {
    return 'FRAUD';
  }
  return 'GATEWAY';
}

function formatStatusMessage(status: string, channel: string | null, errorMessage: string | null): string {
  const channelLabel = channel === 'voice' ? 'Voice call' : channel === 'sms' ? 'SMS' : 'Message';

  switch (status) {
    case 'pending':
      return 'Request queued for processing';
    case 'sending':
      return `${channelLabel} is being sent...`;
    case 'sent':
      return `${channelLabel} sent to carrier`;
    case 'delivered':
      return `${channelLabel} delivered to device`;
    case 'verified':
      return 'OTP code verified successfully';
    case 'failed':
      return errorMessage || `${channelLabel} delivery failed`;
    case 'rejected':
      return errorMessage || 'Request rejected by fraud detection';
    case 'expired':
      return 'OTP code has expired';
    default:
      return `Status: ${status}`;
  }
}
