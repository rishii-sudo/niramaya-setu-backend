import { logger } from '../../common/logger/index.js';

export interface MarathiSttRequest {
  audioBase64: string;
  audioFormat?: 'wav' | 'mp3' | 'aac' | 'webm';
  samplingRate?: number;
}

export interface MarathiSttResponse {
  transcribedTextMarathi: string;
  translatedTextEnglish?: string;
  extractedSymptoms: string[];
  confidence: number;
  provider: string;
  isStub: boolean;
}

export interface MarathiTtsRequest {
  textMarathi: string;
  voiceGender?: 'female' | 'male';
}

export interface MarathiTtsResponse {
  audioBase64: string;
  audioFormat: string;
  provider: string;
  isStub: boolean;
}

export interface IVoiceAdapter {
  speechToText(request: MarathiSttRequest): Promise<MarathiSttResponse>;
  textToSpeech(request: MarathiTtsRequest): Promise<MarathiTtsResponse>;
}

export class PluggableVoiceAdapter implements IVoiceAdapter {
  public async speechToText(request: MarathiSttRequest): Promise<MarathiSttResponse> {
    logger.info({ format: request.audioFormat || 'wav' }, 'Voice Adapter: Received Marathi STT transcription request');

    // Integration Boundary: Calls Bhashini ULCA ASR or OpenAI Whisper
    return {
      transcribedTextMarathi: 'रुग्णाला तीव्र डोकेदुखी आणि ताप आहे.',
      translatedTextEnglish: 'The patient has severe headache and fever.',
      extractedSymptoms: ['डोकेदुखी (Headache)', 'ताप (Fever)'],
      confidence: 0.92,
      provider: 'bhashini-pluggable-adapter-stub',
      isStub: true,
    };
  }

  public async textToSpeech(request: MarathiTtsRequest): Promise<MarathiTtsResponse> {
    logger.info({ textLength: request.textMarathi.length }, 'Voice Adapter: Received Marathi TTS synthesis request');

    return {
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', // Minimal valid WAV header stub
      audioFormat: 'wav',
      provider: 'bhashini-pluggable-adapter-stub',
      isStub: true,
    };
  }
}

export const voiceAdapter: IVoiceAdapter = new PluggableVoiceAdapter();
