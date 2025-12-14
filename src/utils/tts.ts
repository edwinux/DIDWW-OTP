/**
 * Text-to-Speech Utility
 *
 * Generates audio files from text using PicoTTS (SVOX Pico) for Asterisk playback.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/** TTS output directory for Asterisk */
const TTS_DIR = '/var/lib/asterisk/sounds/tts';

/** Voice speed mapping to sox tempo factor (>1 = faster, <1 = slower) */
const SPEED_MAP: Record<string, number> = {
  slow: 0.85,
  medium: 1.0,
  fast: 1.2,
};

/**
 * Ensure TTS directory exists
 */
function ensureTtsDir(): void {
  if (!existsSync(TTS_DIR)) {
    mkdirSync(TTS_DIR, { recursive: true });
  }
}

/**
 * Generate a unique filename based on text content and speed
 */
function generateFilename(text: string, speed: string): string {
  const hash = createHash('md5').update(`${text}-${speed}`).digest('hex').slice(0, 12);
  return `tts-${hash}`;
}

/**
 * Generate TTS audio file from text
 *
 * @param text - Text to convert to speech
 * @param speed - Voice speed (slow, medium, fast)
 * @returns Asterisk sound reference (without extension)
 */
export async function generateTts(text: string, speed: string = 'medium'): Promise<string> {
  ensureTtsDir();

  const filename = generateFilename(text, speed);
  const wavPath = `${TTS_DIR}/${filename}.wav`;
  const slinPath = `${TTS_DIR}/${filename}.sln16`;

  // Check if already generated (cache)
  if (existsSync(slinPath)) {
    logger.debug('TTS cache hit', { filename });
    return `tts/${filename}`;
  }

  const tempoFactor = SPEED_MAP[speed] || SPEED_MAP.medium;

  try {
    // Generate WAV with PicoTTS
    // -l en-US: US English voice
    // -w: output WAV file
    const escapedText = text.replace(/"/g, '\\"');
    await execAsync(
      `pico2wave -l en-US -w "${wavPath}" "${escapedText}"`
    );

    // Convert to Asterisk's signed linear 16kHz format with speed adjustment
    // tempo: adjust speed without changing pitch
    // -r 16000: 16kHz sample rate
    // -c 1: mono
    // -b 16: 16-bit
    // -t raw: raw PCM output
    const tempoEffect = tempoFactor !== 1.0 ? `tempo ${tempoFactor}` : '';
    await execAsync(
      `sox "${wavPath}" -r 16000 -c 1 -b 16 -t raw "${slinPath}" ${tempoEffect}`
    );

    // Clean up WAV file
    await execAsync(`rm -f "${wavPath}"`);

    logger.info('TTS audio generated', { filename, text: text.slice(0, 50) });
    return `tts/${filename}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('TTS generation failed', { error: msg, text });
    throw new Error(`TTS generation failed: ${msg}`);
  }
}

/**
 * Parse message template and replace {code} placeholders
 *
 * @param template - Message template with {code} placeholders
 * @param code - OTP code to substitute
 * @returns Parsed message with code spelled out
 */
export function parseTemplate(template: string, code: string): string {
  // Spell out digits with commas for natural pauses between each digit
  const spelledCode = code.split('').join(', ');
  return template.replace(/\{code\}/g, spelledCode);
}

/**
 * Generate TTS for an OTP message
 *
 * @param template - Message template with {code} placeholders
 * @param code - OTP code
 * @param speed - Voice speed
 * @returns Asterisk sound reference
 */
export async function generateOtpTts(
  template: string,
  code: string,
  speed: string = 'medium'
): Promise<string> {
  const message = parseTemplate(template, code);
  return generateTts(message, speed);
}
