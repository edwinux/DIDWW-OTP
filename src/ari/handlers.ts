/**
 * ARI Event Handlers
 *
 * Stasis application handlers for OTP call flow.
 */

import type { Client as AriClient, Channel } from 'ari-client';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { generateOtpTts } from '../utils/tts.js';
import { OtpRequestRepository } from '../repositories/OtpRequestRepository.js';
import { getWebSocketServer } from '../admin/websocket.js';

/**
 * Active calls tracking
 */
const activeCalls = new Map<string, { phone: string; code: string }>();

/**
 * Register Stasis event handlers on the ARI client
 */
export function registerStasisHandlers(client: AriClient): void {
  client.on('StasisStart', async (event, channel) => {
    const callId = event.args?.[0] || channel.id;
    const callData = activeCalls.get(callId);

    if (!callData) {
      logger.warn('StasisStart for unknown call', { callId });
      return;
    }

    logger.info('Call answered, playing OTP', { callId });

    try {
      await handleOtpCall(client, channel, callData.code);

      // Update status to delivered after OTP is played
      const otpRepo = new OtpRequestRepository();
      otpRepo.updateStatus(callId, 'delivered');

      // Broadcast status update via WebSocket
      const wsServer = getWebSocketServer();
      if (wsServer) {
        wsServer.broadcastOtpUpdate({
          id: callId,
          status: 'delivered',
          channel: 'voice',
          updated_at: Date.now(),
        });
      }

      logger.info('Voice OTP delivered', { callId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Error in OTP call flow', { callId, error: msg });

      // Update status to failed on error
      const otpRepo = new OtpRequestRepository();
      otpRepo.updateStatus(callId, 'failed', { error_message: msg });

      // Broadcast failure via WebSocket
      const wsServer = getWebSocketServer();
      if (wsServer) {
        wsServer.broadcastOtpUpdate({
          id: callId,
          status: 'failed',
          channel: 'voice',
          updated_at: Date.now(),
        });
      }
    } finally {
      activeCalls.delete(callId);
    }
  });

  client.on('StasisEnd', (_event, channel) => {
    const callId = channel.id;
    logger.info('Call ended', { callId });
    activeCalls.delete(callId);
  });

  logger.info('Stasis handlers registered');
}

/**
 * Handle the OTP call flow: answer, generate TTS, play message, hangup
 */
async function handleOtpCall(client: AriClient, channel: Channel, code: string): Promise<void> {
  const config = getConfig();
  const { messageTemplate, speed } = config.voice;

  // Answer the call
  await channel.answer();
  await sleep(500);

  try {
    // Generate TTS audio from template
    const soundRef = await generateOtpTts(messageTemplate, code, speed);
    logger.debug('Playing TTS audio', { soundRef });

    // Play the TTS message
    await playSound(client, channel, `sound:${soundRef}`);

    // Brief pause before hangup
    await sleep(500);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('TTS playback failed, falling back to digits', { error: msg });

    // Fallback: just speak digits if TTS fails
    await speakDigits(client, channel, code, config.voice.digitPauseMs);
    await sleep(500);
  }

  // Hangup
  await channel.hangup();
}

/**
 * Play a sound file on the channel and wait for completion
 */
async function playSound(client: AriClient, channel: Channel, media: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playback = (client as any).Playback();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Playback timeout'));
    }, 60000); // 60 second timeout

    playback.on('PlaybackFinished', () => {
      clearTimeout(timeout);
      resolve();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channel as any).play({ media }, playback).catch((err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Speak digits one by one with pauses
 */
async function speakDigits(client: AriClient, channel: Channel, code: string, pauseMs: number): Promise<void> {
  for (const digit of code) {
    await playSound(client, channel, `sound:digits/${digit}`);
    await sleep(pauseMs);
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Originate an OTP call
 */
export async function originateOtpCall(
  client: AriClient,
  phone: string,
  code: string,
  callId: string
): Promise<void> {
  const config = getConfig();

  // Store call data for StasisStart handler
  activeCalls.set(callId, { phone, code });

  try {
    const channel = client.Channel();

    await channel.originate({
      endpoint: `PJSIP/${phone}@didww`,
      app: 'otp-stasis',
      appArgs: callId,
      callerId: `"${config.didww.callerId}" <${config.didww.callerId}>`,
      timeout: 30,
      variables: {
        'CALLERID(num)': config.didww.callerId,
        'CALLERID(name)': config.didww.callerId,
      },
    });

    logger.info('Call originated', { callId, phone: phone.slice(0, 3) + '***' });
  } catch (error) {
    activeCalls.delete(callId);
    throw error;
  }
}
