export interface VideoSubmission {
  videoUrl: string;
  fileName: string;
  ambientUrl?: string;
  audioTracks?: Array<{ index: number; language: string; codec: string; channels?: number }>;
  subtitles?: Array<{ index: number; language: string; codec: string }>;
} 