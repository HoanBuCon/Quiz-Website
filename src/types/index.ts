// Định nghĩa các types cho dự án Quiz Website

export interface DragTarget {
  id: string;
  label: string;
}
export interface DragItem {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  question: string;
  type: "single" | "multiple" | "text" | "drag" | "composite"; // + kéo thả, câu hỏi mẹ
  // Với trắc nghiệm: mảng string; với kéo thả: { targets, items }
  options?:
    | string[]
    | { targets: DragTarget[]; items: DragItem[]; [k: string]: any };
  // Với trắc nghiệm/text: string[]; với kéo thả: map itemId -> targetId
  correctAnswers: string[] | Record<string, string>;
  explanation?: string; // Giải thích đáp án
  questionImage?: string; // Ảnh cho câu hỏi (base64 hoặc url)
  optionImages?: { [key: string]: string }; // Ảnh cho từng đáp án (key là text đáp án)
  // Với câu hỏi mẹ
  subQuestions?: Question[];
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  questions: Question[]; // Chỉ được load đầy đủ khi vào trang Quiz/Edit
  questionCount?: number; // Dùng cho listing để tránh tải câu hỏi
  createdAt: Date;
  updatedAt: Date;
  accessType?: "owner" | "shared" | "public"; // runtime-only: FE permissions
}

export interface ClassRoom {
  id: string;
  name: string;
  description?: string;
  quizIds?: string[]; // IDs của các quiz thuộc lớp học này (old format)
  quizzes?: Quiz[] | string[]; // Danh sách quiz hoặc IDs (new format, runtime only)
  isPublic?: boolean;
  students?: any[];
  isActive?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  accessType?: "owner" | "shared" | "public"; // runtime-only: FE permissions
}

export interface UserAnswer {
  questionId: string;
  answers: any[]; // với kéo thả: [mapping]
  isCorrect?: boolean;
}

export interface QuizSession {
  id: string;
  quizId: string;
  answers: UserAnswer[];
  score?: number;
  totalQuestions: number;
  completedAt?: Date;
  quizSnapshot?: {
    quizTitle: string;
    questions: Question[];
  };
}

export interface UploadedFile {
  id: string;
  name: string;
  type: "docs" | "json" | "txt" | "pdf";
  size: number;
  uploadedAt: Date;
  content?: string;
  quizzes?: Quiz[];
}

export interface ExtractedImage {
  id: string;                    // Unique ID for the image
  data: string;                  // Base64 encoded image data or URL
  position?: number;             // Position in original document
  questionIndex?: number | null; // Index of question this image belongs to (null if unassigned)
  location?: 'question' | 'option' | 'unassigned'; // Where the image should be placed
  optionIndex?: number;          // If location is 'option', which option index
}
