import { Part } from "@google/genai";

// For multi-part T/F questions
export interface SubQuestion {
  statement: string;
  answer: 'True' | 'False';
}

export type DifficultyLevel = 'recognition' | 'comprehension' | 'application';

export interface QuizQuestion {
  question: string;
  passage?: string; // Optional text passage/context for the question
  image?: string; // Optional base64 data URI for an image
  audio?: string; // Optional base64 data URI for audio
  explanation: string; // AI-generated explanation for the correct answer
  difficulty?: DifficultyLevel; // Optional difficulty level

  // Type discriminator
  type: 'multiple-choice' | 'multi-true-false' | 'short-answer';

  // For 'multiple-choice'
  options?: string[];
  answer?: string;

  // For 'multi-true-false'
  subQuestions?: SubQuestion[];
}

export type SelectableQuestionType = 'multiple-choice' | 'multi-true-false' | 'short-answer';


export interface Folder {
  id: string;
  name: string;
}

// Represents a quiz generated from a file
export interface GeneratedQuiz {
  id: string; // Use timestamp + title for a unique enough ID
  title: string;
  createdAt: string; // ISO string
  questions: QuizQuestion[];
  folderId?: string;
  model?: GeminiModel;
}

// Represents a single attempt at a quiz
export interface QuizAttempt {
  id:string; // Unique ID for the attempt
  quizId: string; // Foreign key to GeneratedQuiz
  quizTitle: string;
  date: string; // ISO string
  score: number;
  totalQuestions: number;
  userAnswers: UserAnswers;
  duration: number; // in seconds
  status?: 'completed' | 'in-progress';
  config?: QuizConfig;
  smartCheckOutcomes?: Record<number, boolean>;
}

export type QuizMode = 'study' | 'test';

export interface TimerSettings {
  perQuestion: number; // seconds
  perComplexQuestion: number; // minutes
}

export interface QuizConfig {
    mode: QuizMode;
    timer: TimerSettings;
    showExplanations: boolean;
}

// User's answer for a single question.
// For 'multiple-choice', it's a string.
// For 'multi-true-false', it's an array of 'True'/'False'/null.
export type SingleUserAnswer = string | ('True' | 'False' | null)[] | null;

// Array of answers for the whole quiz
export type UserAnswers = SingleUserAnswer[];

export type Language = 'en' | 'vi';

export type GeminiModel = 'gemini-2.5-pro' | 'gemini-flash-latest' | 'gemini-2.5-flash' | 'gemini-flash-lite-latest';

// FIX: Export ShuffleSettings interface to fix module import error.
export interface ShuffleSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

// --- Knowledge Base Types ---
export interface KnowledgeBase {
  id: string;
  name: string;
  createdAt: string;
}

export type KnowledgeBlock = 
  | { type: 'text'; content: string; }
  | { type: 'image'; content: string; mimeType: string; } // content is base64
  | { type: 'audio'; content: string; mimeType: string; }; // content is base64

export interface KnowledgeEntry {
  id: string;
  knowledgeBaseId: string;
  title: string;
  contentBlocks: KnowledgeBlock[];
  createdAt: string;
  lastModified: string;
}

// --- Quiz Generation Flow Types ---
export type GenerationMode = 'extract' | 'theory';
export type CustomQuestionCounts = { [key in SelectableQuestionType]?: number };
export type CustomQuestionCountModes = { [key in SelectableQuestionType]?: 'auto' | 'custom' };

// New types for difficulty levels
export type DifficultyLevels = { [key in SelectableQuestionType]?: Set<DifficultyLevel> };
export type DifficultyCountModes = { [key in SelectableQuestionType]?: { [key in DifficultyLevel]?: 'auto' | 'custom' } };
export type DifficultyCounts = { [key in SelectableQuestionType]?: { [key in DifficultyLevel]?: number } };