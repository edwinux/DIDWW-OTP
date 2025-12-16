/**
 * Channel Provider Interface
 *
 * Strategy pattern interface for OTP delivery channels.
 */

/**
 * Supported channel types
 */
export type ChannelType = 'sms' | 'voice';

/**
 * Channel delivery result
 */
export interface ChannelDeliveryResult {
  success: boolean;
  channelType: ChannelType;
  providerId?: string;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel provider interface
 */
export interface IChannelProvider {
  /**
   * Channel type identifier
   */
  readonly channelType: ChannelType;

  /**
   * Send OTP via this channel
   * @param phone - Phone number in E.164 format
   * @param code - OTP code to deliver
   * @param requestId - Unique request identifier for tracking
   * @returns Delivery result
   */
  send(phone: string, code: string, requestId: string): Promise<ChannelDeliveryResult>;

  /**
   * Check if channel is available and healthy
   */
  isAvailable(): Promise<boolean>;
}
