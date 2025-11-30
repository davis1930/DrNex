export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  type: 'text' | 'audio_transcription' | 'map_result';
  metadata?: {
    mapLinks?: { uri: string; title: string }[];
  };
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  inputText: string;
}

export enum TriageMode {
  GENERAL = 'GENERAL',
  FINDING_CLINIC = 'FINDING_CLINIC',
}