/**
 * ARI Event Handlers
 *
 * Stasis application handlers for OTP call flow.
 */

import type { Client as AriClient, Channel } from 'ari-client';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { generateOtpTts } from '../utils/tts.js';
import { emitOtpEvent } from '../services/OtpEventService.js';

/**
 * Call state tracking
 */
interface CallState {
  phone: string;
  code: string;
  otpPlayed: boolean;       // Whether OTP audio finished playing
  systemHangup: boolean;    // Whether system initiated hangup (vs user)
}

const activeCalls = new Map<string, CallState>();

/**
 * Register Stasis event handlers on the ARI client
 */
export function registerStasisHandlers(client: AriClient): void {
  client.on('StasisStart', async (event, channel) => {
    const callId = event.args?.[0] || channel.id;
    const callState = activeCalls.get(callId);

    if (!callState) {
      logger.warn('StasisStart for unknown call', { callId });
      return;
    }

    // Emit answered event
    emitOtpEvent(callId, 'voice', 'answered');
    logger.info('Call answered', { callId });

    try {
      await handleOtpCall(client, channel, callState, callId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Check if this is a "Channel not found" error (user hung up)
      if (msg.includes('Channel not found') || msg.includes('not found')) {
        // User hung up - emit hangup event with context
        emitOtpEvent(callId, 'voice', 'hangup', {
          hung_up_by: 'user',
          otp_played: callState.otpPlayed,
        });
        logger.info('User hung up', { callId, otpPlayed: callState.otpPlayed });
      } else {
        // Actual error
        logger.error('Error in OTP call flow', { callId, error: msg });
        emitOtpEvent(callId, 'voice', 'failed', { error: msg });
      }
    } finally {
      activeCalls.delete(callId);
    }
  });

  client.on('StasisEnd', (_event, channel) => {
    const callId = channel.id;
    const callState = activeCalls.get(callId);

    if (callState && !callState.systemHangup) {
      // User hung up before system did
      emitOtpEvent(callId, 'voice', 'hangup', {
        hung_up_by: 'user',
        otp_played: callState.otpPlayed,
      });
      logger.info('User hung up (StasisEnd)', { callId, otpPlayed: callState.otpPlayed });
      activeCalls.delete(callId);
    }

    logger.debug('Call ended', { callId });
  });

  logger.info('Stasis handlers registered');
}

/**
 * Handle the OTP call flow: answer, generate TTS, play message, hangup
 */
async function handleOtpCall(client: AriClient, channel: Channel, callState: CallState, callId: string): Promise<void> {
  const config = getConfig();
  const { messageTemplate, speed } = config.voice;

  // Answer the call
  await channel.answer();
  await sleep(500);

  // Emit playing event
  emitOtpEvent(callId, 'voice', 'playing');

  try {
    // Generate TTS audio from template
    const soundRef = await generateOtpTts(messageTemplate, callState.code, speed);
    logger.debug('Playing TTS audio', { soundRef });

    // Play the TTS message
    await playSound(client, channel, `sound:${soundRef}`);

    // Mark OTP as played successfully
    callState.otpPlayed = true;

    // Brief pause before hangup
    await sleep(500);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Check if user hung up during playback
    if (msg.includes('Channel not found') || msg.includes('not found')) {
      throw error; // Re-throw to be handled by caller
    }

    logger.error('TTS playback failed, falling back to digits', { error: msg });

    // Fallback: just speak digits if TTS fails
    await speakDigits(client, channel, callState.code, config.voice.digitPauseMs);
    callState.otpPlayed = true;
    await sleep(500);
  }

  // Mark that system is initiating hangup
  callState.systemHangup = true;

  // Hangup
  await channel.hangup();

  // Emit completed event (system hung up after OTP played)
  emitOtpEvent(callId, 'voice', 'completed', { hung_up_by: 'system' });
  logger.info('Voice OTP completed', { callId });
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
 *
 * @param client - ARI client
 * @param phone - Destination phone number (E.164 format)
 * @param code - OTP code to speak
 * @param callId - Unique call/request ID
 * @param callerId - Caller ID to use (from CallerIdRouter)
 */
export async function originateOtpCall(
  client: AriClient,
  phone: string,
  code: string,
  callId: string,
  callerId: string
): Promise<void> {
  // Store call state for StasisStart handler
  activeCalls.set(callId, {
    phone,
    code,
    otpPlayed: false,
    systemHangup: false,
  });

  // Emit calling event
  emitOtpEvent(callId, 'voice', 'calling');

  try {
    const channel = client.Channel();

    await channel.originate({
      endpoint: `PJSIP/${phone}@didww`,
      app: 'otp-stasis',
      appArgs: callId,
      callerId: `"${callerId}" <${callerId}>`,
      timeout: 30,
      variables: {
        'CALLERID(num)': callerId,
        'CALLERID(name)': callerId,
      },
    });

    // Emit ringing event after successful originate
    emitOtpEvent(callId, 'voice', 'ringing');
    logger.info('Call originated', { callId, phone: phone.slice(0, 3) + '***', callerId });
  } catch (error) {
    activeCalls.delete(callId);
    emitOtpEvent(callId, 'voice', 'failed', { error: 'Call origination failed' });
    throw error;
  }
}
