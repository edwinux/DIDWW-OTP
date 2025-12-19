/**
 * ARI Event Handlers
 *
 * Stasis application handlers for OTP call flow.
 * Uses CallTrackerService for centralized call state management.
 */

import type { Client as AriClient, Channel } from 'ari-client';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { generateOtpTts } from '../utils/tts.js';
import { emitOtpEvent } from '../services/OtpEventService.js';
import { getCallTracker, type CallState } from '../services/CallTrackerService.js';

/**
 * Register Stasis event handlers on the ARI client
 */
export function registerStasisHandlers(client: AriClient): void {
  const tracker = getCallTracker();

  client.on('StasisStart', async (event, channel) => {
    const callId = event.args?.[0] || channel.id;
    const callState = tracker.getCallState(callId);

    if (!callState) {
      logger.warn('StasisStart for unknown call', { callId });
      return;
    }

    // Update channel ID for correlation
    tracker.setChannelId(callId, channel.id);

    // Mark answered and get ring duration
    const durations = tracker.markAnswered(callId);

    // Emit answered event with ring duration
    emitOtpEvent(callId, 'voice', 'answered', {
      ring_duration_ms: durations.ringDurationMs,
    });
    logger.info('Call answered', { callId, ringDurationMs: durations.ringDurationMs });

    try {
      await handleOtpCall(client, channel, callState, callId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Check if this is a "Channel not found" error (user hung up)
      if (msg.includes('Channel not found') || msg.includes('not found')) {
        // User hung up - end call and emit hangup event
        const result = tracker.endCall(callId);
        emitOtpEvent(callId, 'voice', 'hangup', {
          hung_up_by: 'user',
          otp_played: result?.state.otpPlayed ?? false,
          ring_duration_ms: result?.durations.ringDurationMs,
          talk_duration_ms: result?.durations.talkDurationMs,
        });
        logger.info('User hung up', {
          callId,
          otpPlayed: result?.state.otpPlayed,
          talkDurationMs: result?.durations.talkDurationMs,
        });
      } else {
        // Actual error - end call and emit failed event
        tracker.endCall(callId);
        logger.error('Error in OTP call flow', { callId, error: msg });
        emitOtpEvent(callId, 'voice', 'failed', { error: msg });
      }
    }
  });

  client.on('StasisEnd', (_event, channel) => {
    const callId = channel.id;
    const callState = tracker.getCallState(callId);

    if (callState && !callState.systemHangup) {
      // User hung up before system did - end call and get durations
      const result = tracker.endCall(callId);
      if (result) {
        emitOtpEvent(callId, 'voice', 'hangup', {
          hung_up_by: 'user',
          otp_played: result.state.otpPlayed,
          ring_duration_ms: result.durations.ringDurationMs,
          talk_duration_ms: result.durations.talkDurationMs,
        });
        logger.info('User hung up (StasisEnd)', {
          callId,
          otpPlayed: result.state.otpPlayed,
          talkDurationMs: result.durations.talkDurationMs,
        });
      }
    }

    logger.debug('Call ended', { callId });
  });

  logger.info('Stasis handlers registered');
}

/**
 * Handle the OTP call flow: answer, play message (TTS or pre-recorded), hangup
 */
async function handleOtpCall(client: AriClient, channel: Channel, callState: CallState, callId: string): Promise<void> {
  const config = getConfig();
  const { messageTemplate, speed, usePrerecordedSounds } = config.voice;
  const tracker = getCallTracker();

  // Answer the call
  await channel.answer();
  await sleep(500);

  // Emit playing event
  emitOtpEvent(callId, 'voice', 'playing');

  try {
    if (usePrerecordedSounds) {
      // Use pre-recorded sound files
      logger.debug('Playing pre-recorded sounds', { code: callState.code });
      await playPrerecordedOtp(client, channel, callState.code, config.voice.digitPauseMs);
    } else {
      // Generate TTS audio from template
      const soundRef = await generateOtpTts(messageTemplate, callState.code, speed);
      logger.debug('Playing TTS audio', { soundRef });

      // Play the TTS message
      await playSound(client, channel, `sound:${soundRef}`);
    }

    // Mark OTP as played successfully
    tracker.markOtpPlayed(callId);

    // Brief pause before hangup
    await sleep(500);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Check if user hung up during playback
    if (msg.includes('Channel not found') || msg.includes('not found')) {
      throw error; // Re-throw to be handled by caller
    }

    logger.error('Playback failed, falling back to digits', { error: msg });

    // Fallback: just speak digits if playback fails
    await speakDigits(client, channel, callState.code, config.voice.digitPauseMs);
    tracker.markOtpPlayed(callId);
    await sleep(500);
  }

  // Mark that system is initiating hangup
  tracker.markSystemHangup(callId);

  // Hangup
  await channel.hangup();

  // End call and get final durations
  const result = tracker.endCall(callId);

  // Emit completed event with durations
  emitOtpEvent(callId, 'voice', 'completed', {
    hung_up_by: 'system',
    ring_duration_ms: result?.durations.ringDurationMs,
    talk_duration_ms: result?.durations.talkDurationMs,
  });
  logger.info('Voice OTP completed', {
    callId,
    ringDurationMs: result?.durations.ringDurationMs,
    talkDurationMs: result?.durations.talkDurationMs,
  });
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
 * Play pre-recorded OTP message sequence:
 * Hello -> digits -> Repeating -> digits -> Thankyou
 */
async function playPrerecordedOtp(client: AriClient, channel: Channel, code: string, pauseMs: number): Promise<void> {
  // Play intro
  await playSound(client, channel, 'sound:custom/Hello');
  await sleep(300);

  // Play digits first time
  for (const digit of code) {
    await playSound(client, channel, `sound:custom/${digit}`);
    await sleep(pauseMs);
  }

  // Play "Repeating"
  await sleep(300);
  await playSound(client, channel, 'sound:custom/Repeating');
  await sleep(300);

  // Play digits second time
  for (const digit of code) {
    await playSound(client, channel, `sound:custom/${digit}`);
    await sleep(pauseMs);
  }

  // Play outro
  await sleep(300);
  await playSound(client, channel, 'sound:custom/Thankyou');
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
  const tracker = getCallTracker();

  // Register call with tracker (also sets up AMI correlation)
  tracker.registerCall(callId, phone, code, callerId);

  // Emit calling event
  emitOtpEvent(callId, 'voice', 'calling');

  try {
    const channel = client.Channel();

    // Get SIP host from config for P-Asserted-Identity
    const { getConfig } = await import('../config/index.js');
    const config = getConfig();
    const sipHost = config.didww.sipHost;

    await channel.originate({
      endpoint: `PJSIP/${phone}@didww`,
      app: 'otp-stasis',
      appArgs: callId,
      callerId: `"${callerId}" <${callerId}>`,
      timeout: 30,
      variables: {
        // Standard caller ID variables
        'CALLERID(num)': callerId,
        'CALLERID(name)': callerId,
        // PJSIP-specific: Set From header user part
        'PJSIP_HEADER(add,P-Asserted-Identity)': `<sip:${callerId}@${sipHost}>`,
        // Enable RPID/PAI header sending
        'PJSIP_SEND_RPID': 'send_pai',
      },
    });

    // Emit ringing event after successful originate
    emitOtpEvent(callId, 'voice', 'ringing');
    logger.info('Call originated', { callId, phone: phone.slice(0, 3) + '***', callerId });
  } catch (error) {
    tracker.endCall(callId);
    emitOtpEvent(callId, 'voice', 'failed', { error: 'Call origination failed' });
    throw error;
  }
}
