import { env } from '../config/env';

export class GroqTranscriptionService {
  static isConfigured(): boolean {
    return !!(env.GROQ_API_KEY && env.GROQ_API_BASE);
  }

  static async transcribe(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
    if (!env.GROQ_API_KEY || !env.GROQ_API_BASE) {
      throw new Error('Groq no está configurado (GROQ_API_KEY / GROQ_API_BASE)');
    }

    const ext = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
      : mimeType.includes('wav') ? 'wav'
      : mimeType.includes('mp4') ? 'm4a'
      : 'ogg';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
    form.append('model', env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
    if (env.GROQ_WHISPER_LANGUAGE) {
      form.append('language', env.GROQ_WHISPER_LANGUAGE);
    }

    const res = await fetch(`${env.GROQ_API_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq transcription failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as { text?: string };
    const text = data.text?.trim();
    if (!text) throw new Error('Groq devolvió transcripción vacía');
    return text;
  }
}
