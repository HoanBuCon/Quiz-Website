import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { GeneratedQuiz, UserAnswers, QuizAttempt, QuizConfig, Folder, Language, SelectableQuestionType, KnowledgeBase, KnowledgeEntry, KnowledgeBlock, GeminiModel, GenerationMode, CustomQuestionCountModes, CustomQuestionCounts, DifficultyLevels, DifficultyCountModes, DifficultyCounts } from './types';
import FileUpload from './components/FileUpload';
import ModeSelectionView from './components/ModeSelectionView';
import SettingsView from './components/SettingsView';
import QuizView from './components/QuizView';
import ResultsView from './components/ResultsView';
import HistoryView from './components/HistoryView';
import EditQuizView from './components/EditQuizView';
import PendingJobsView from './components/PendingJobsView';
import QuizTypeSelectionView from './components/QuizTypeSelectionView';
import KnowledgeBaseView from './components/KnowledgeBaseView';
import { extractFileParts } from './services/fileExtractor';
import { generateQuiz } from './services/geminiService';
import { FacebookIcon, SettingsIcon, SunIcon, MoonIcon, XCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, InfoIcon, CloseIcon } from './components/icons';
import LatexRenderer from './components/LatexRenderer';

type AppState = 'upload' | 'modeSelection' | 'selectingTypes' | 'settings' | 'quiz' | 'results' | 'editing' | 'knowledgeBaseView';
type Theme = 'light' | 'dark';
type JobStatus = 'processing' | 'completed' | 'error' | 'cancelled';

export interface ProcessingJob {
  id: string;
  files: File[];
  title: string;
  generationMode: GenerationMode;
  status: JobStatus;
  result?: GeneratedQuiz;
  error?: string;
  controller: AbortController;
}

// NEW: Notification system
interface Notification {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info' | 'warning';
}

const NotificationToast: React.FC<{ notification: Notification, onDismiss: () => void }> = ({ notification, onDismiss }) => {
  const baseClasses = "flex items-start gap-3 p-4 rounded-lg shadow-lg text-white animate-slide-in-top backdrop-blur-sm border";
  const typeStyles = {
    error: 'bg-red-500/80 border-red-400/50',
    success: 'bg-green-500/80 border-green-400/50',
    warning: 'bg-yellow-500/80 border-yellow-400/50',
    info: 'bg-blue-500/80 border-blue-400/50',
  };

  const icon = {
    error: <XCircleIcon className="w-6 h-6" />,
    success: <CheckCircleIcon className="w-6 h-6" />,
    warning: <ExclamationTriangleIcon className="w-6 h-6" />,
    info: <InfoIcon className="w-6 h-6" />,
  }[notification.type];

  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`${baseClasses} ${typeStyles[notification.type]}`} role="alert">
      <div className="flex-shrink-0 pt-0.5">{icon}</div>
      <div className="flex-grow text-sm font-semibold">{notification.message}</div>
      <button onClick={onDismiss} className="p-1 -mr-2 -mt-2 rounded-full hover:bg-white/20 transition-colors" aria-label="Dismiss">
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

const tips = {
    vi: [
        "Tải lên một đề thi và để AI tạo ra một bài kiểm tra tương tác cho bạn.",
        "**Mẹo hay:** Dùng `Gemini 2.5 Pro` khi tạo quiz từ tài liệu phức tạp để có kết quả chính xác nhất.",
        "**Mẹo hay:** Cần tạo quiz thật nhanh? Chọn `Gemini Flash Latest` để tối ưu hóa tốc độ.",
        "**Mẹo hay:** Khi chỉnh sửa câu hỏi, dùng `AI Assistant` với `Gemini 2.5 Pro` để nhận được gợi ý đáp án và giải thích chất lượng cao.",
        "**Bạn có biết?** Bật `Sử dụng Tìm kiếm trên Web` khi tạo quiz về các chủ đề mới để AI có thông tin cập nhật nhất.",
        "**Bạn có biết?** Xây dựng `Kiến thức chuyên môn` của riêng bạn để AI tạo ra các lời giải thích dựa trên chính tài liệu của bạn.",
        "**Mẹo hay:** Trong Chế độ Học, tính năng `Chấm bài thông minh` cho câu trả lời ngắn có thể hiểu được các từ đồng nghĩa và cách diễn đạt tương tự.",
        "**Bạn có biết?** Ứng dụng có thể trích xuất hình ảnh từ tệp `.docx` và tự động thêm chúng vào câu hỏi trắc nghiệm.",
        "**Mẹo hay:** Sau khi tạo quiz, bạn có thể vào `Chỉnh sửa` để thêm đoạn văn tham khảo hoặc hình ảnh cho bất kỳ câu hỏi nào."
    ],
    en: [
        "Upload a test paper, and let AI create an interactive quiz for you.",
        "**Pro Tip:** Use `Gemini 2.5 Pro` when creating a quiz from complex documents for the most accurate results.",
        "**Pro Tip:** Need to generate a quiz quickly? Choose `Gemini Flash Latest` for optimized speed.",
        "**Pro Tip:** When editing questions, use the `AI Assistant` with `Gemini 2.5 Pro` to get high-quality answer and explanation suggestions.",
        "**Did you know?** Enable `Use Web Search` when creating a quiz on recent topics for the most up-to-date information.",
        "**Did you know?** Build your own `Knowledge Base` to have the AI generate explanations based on your custom content.",
        "**Pro Tip:** In Study Mode, the `Smart Checking` for short answers can understand synonyms and similar phrasing.",
        "**Did you know?** The app can extract images from `.docx` files and automatically add them to your quiz questions.",
        "**Pro Tip:** After generating a quiz, you can `Edit` it to add reference passages or images to any question."
    ]
};


// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const ThemeToggleVisual: React.FC<{ theme: Theme; onClick: () => void }> = ({ theme, onClick }) => {
    const stars = useMemo(() => {
        return Array.from({ length: 15 }).map((_, i) => ({
            id: i,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 2 + 1}px`,
            height: `${Math.random() * 2 + 1}px`,
            animationDelay: `${Math.random() * 3}s`,
        }));
    }, []);

    return (
        <div onClick={onClick} className="theme-toggle-container" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <div className="stars">
                {stars.map(star => (
                    <div
                        key={star.id}
                        className="star"
                        style={{
                            top: star.top,
                            left: star.left,
                            width: star.width,
                            height: star.height,
                            animationDelay: star.animationDelay,
                        }}
                    />
                ))}
            </div>
            <div className="theme-toggle-thumb">
                <div className="theme-icon sun-icon">
                    <SunIcon />
                </div>
                 <div className="theme-icon moon-icon">
                    <MoonIcon />
                </div>
            </div>
        </div>
    );
};


const GlobalSettings: React.FC<{
    theme: Theme; 
    setTheme: (theme: Theme) => void;
    lang: Language;
    setLang: (lang: Language) => void;
}> = ({ theme, setTheme, lang, setLang }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('quizAppTheme', newTheme);
    };

    useEffect(() => {
        document.documentElement.className = theme;
    }, [theme]);

    return (
        <div className="fixed top-4 left-4 z-50">
            <div className="relative">
                <button onClick={() => setIsOpen(!isOpen)} className="flex flex-col items-center gap-0.5 text-text-subtle hover:text-text-main transition-colors" aria-label="Open settings">
                    <SettingsIcon className="w-4 h-4"/>
                    <span className="text-[0.6rem] font-semibold tracking-wider uppercase">{lang === 'vi' ? 'Cài đặt' : 'Settings'}</span>
                </button>
                {isOpen && (
                    <div className="absolute top-full mt-2 left-0 bg-base-200 p-4 rounded-lg shadow-lg w-64 border border-border-color animate-slide-in-down">
                        <h3 className="font-bold mb-3 text-text-main">{lang === 'vi' ? 'Cài đặt' : 'Settings'}</h3>
                        <div className="space-y-4">
                             <div className="flex justify-between items-center">
                                <span className="font-semibold text-sm text-text-main">{lang === 'vi' ? 'Giao diện' : 'Theme'}</span>
                                <ThemeToggleVisual theme={theme} onClick={toggleTheme} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-sm text-text-main">{lang === 'vi' ? 'Ngôn ngữ' : 'Language'}</span>
                                <div className="flex gap-1 bg-base-300 p-1 rounded-md">
                                    <button onClick={() => setLang('en')} className={`px-2 py-1 text-sm rounded-md ${lang === 'en' ? 'bg-base-200 shadow-sm text-text-main font-semibold' : 'text-text-subtle'}`}>English</button>
                                    <button onClick={() => setLang('vi')} className={`px-2 py-1 text-sm rounded-md ${lang === 'vi' ? 'bg-base-200 shadow-sm text-text-main font-semibold' : 'text-text-subtle'}`}>Tiếng Việt</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('upload');
  const [theme, setTheme] = useState<Theme>('dark');
  const [lang, setLang] = useState<Language>('vi');
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  
  // Quiz generation and settings state
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode | null>(null);
  const [unprocessedQuiz, setUnprocessedQuiz] = useState<GeneratedQuiz | null>(null);
  const [quizToEdit, setQuizToEdit] = useState<GeneratedQuiz | null>(null);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  
  // Active quiz state
  const [currentQuiz, setCurrentQuiz] = useState<GeneratedQuiz | null>(null);
  const [quizConfig, setQuizConfig] = useState<QuizConfig | null>(null);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>([]);
  const [initialDuration, setInitialDuration] = useState(0);

  // History state
  const [generatedQuizzes, setGeneratedQuizzes] = useState<GeneratedQuiz[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  // Database Knowledge state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [currentKnowledgeBaseId, setCurrentKnowledgeBaseId] = useState<string | null>(null);

  // State for reviewing a past result
  const [reviewData, setReviewData] = useState<{quiz: GeneratedQuiz, attempt: QuizAttempt} | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // Notification handlers
  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
  }, []);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);
  
  // Effect for rotating tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
        setCurrentTipIndex(prevIndex => (prevIndex + 1) % tips.vi.length);
    }, 7000); // Change tip every 7 seconds

    return () => clearInterval(tipInterval);
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(setNotificationPermission);
    }
  }, []);

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('quizAppTheme') as Theme;
      if (storedTheme) setTheme(storedTheme);

      const storedLang = localStorage.getItem('quizAppLang') as Language;
      if (storedLang) setLang(storedLang);
      
      const storedQuizzes = localStorage.getItem('generatedQuizzes');
      if (storedQuizzes) setGeneratedQuizzes(JSON.parse(storedQuizzes));
      
      const storedAttempts = localStorage.getItem('quizAttempts');
      if (storedAttempts) setQuizAttempts(JSON.parse(storedAttempts));
      
      const storedFolders = localStorage.getItem('quizFolders');
      if (storedFolders) setFolders(JSON.parse(storedFolders));

      const storedKBs = localStorage.getItem('knowledgeBases');
      if (storedKBs) setKnowledgeBases(JSON.parse(storedKBs));

      const storedKEntries = localStorage.getItem('knowledgeEntries');
        if (storedKEntries) {
            try {
                const parsedEntries = JSON.parse(storedKEntries);
                const migratedEntries = parsedEntries.map((entry: any) => {
                    let currentEntry = { ...entry };

                    // Migration 1: from { content } to { title, note }
                    if (currentEntry.content && typeof currentEntry.title === 'undefined') {
                        const lines = currentEntry.content.split('\n');
                        let title = 'Untitled Entry';
                        let noteStartIndex = 0;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].trim() !== '') {
                                title = lines[i].replace(/^#+\s*/, '').trim();
                                noteStartIndex = i + 1;
                                break;
                            }
                        }
                        const note = lines.slice(noteStartIndex).join('\n').trim();
                        const { content, ...rest } = currentEntry;
                        currentEntry = { ...rest, title, note };
                    }

                    // Migration 2: from { note } to { contentBlocks }
                    if (currentEntry.note && typeof currentEntry.contentBlocks === 'undefined') {
                        const { note, ...rest } = currentEntry;
                        const blocks: KnowledgeBlock[] = note.trim() ? [{ type: 'text', content: note }] : [];
                        currentEntry = { ...rest, contentBlocks: blocks };
                    } else if (!currentEntry.contentBlocks) {
                        // Ensure contentBlocks exists
                        currentEntry.contentBlocks = [];
                    }
                    
                    // Clean up legacy properties
                    delete currentEntry.content;
                    delete currentEntry.note;

                    return currentEntry;
                });
                setKnowledgeEntries(migratedEntries);
                localStorage.setItem('knowledgeEntries', JSON.stringify(migratedEntries));
            } catch (e) {
                console.error("Failed to parse or migrate knowledge entries from localStorage", e);
                 try {
                    // Fallback to just parsing if migration fails
                    setKnowledgeEntries(JSON.parse(storedKEntries));
                } catch (e2) {
                    console.error("Failed to parse knowledge entries as a fallback", e2);
                }
            }
        }

    } catch (e) {
      console.error("Failed to parse from localStorage", e);
      // Don't clear all data, just the problematic one if possible
    }
  }, []);

  const handleSetLang = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('quizAppLang', newLang);
  }

  // Helper to send notifications
  const sendNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    // 1. Check for permission
    if (notificationPermission !== 'granted') {
      return;
    }

    // 2. Try to use the Service Worker for reliable background notifications
    if ('serviceWorker' in navigator) {
      try {
        // navigator.serviceWorker.ready ensures the SW is active
        const registration = await navigator.serviceWorker.ready;
        // The 'notificationclick' event in service-worker.js handles the click
        await registration.showNotification(title, options);
        return; // Exit if successful
      } catch (e) {
        console.warn('Could not show notification via Service Worker, falling back.', e);
      }
    }
    
    // 3. Fallback to the standard Notification API if SW fails or is not supported
    try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
            // This is a simple focus for the fallback case
            window.parent.focus(); 
            window.focus();
        };
    } catch (e) {
        console.error('Fallback notification failed.', e);
    }
  }, [notificationPermission]);
  
  const handleFileProcess = useCallback(async (
    files: File[],
    quizTitle: string,
    selectedTypes: SelectableQuestionType[], 
    shouldGenerateExplanations: boolean,
    selectedEntryIds: string[],
    integrateGeneralAI: boolean,
    selectedModel: GeminiModel,
    useWebSearch: boolean,
    generationMode: GenerationMode,
    questionCountModes: CustomQuestionCountModes,
    customQuestionCounts: CustomQuestionCounts,
    difficultyLevels: DifficultyLevels,
    difficultyCountModes: DifficultyCountModes,
    difficultyCounts: DifficultyCounts
  ) => {
    setError(null);
    const jobId = `${Date.now()}-${quizTitle}`;
    const controller = new AbortController();
    
    const newJob: ProcessingJob = { 
        id: jobId, 
        files: files, 
        title: quizTitle,
        generationMode: generationMode,
        status: 'processing', 
        controller 
    };
    setProcessingJobs(prev => [...prev, newJob]);

    sendNotification(
      lang === 'vi' ? `Bắt đầu xử lý: ${quizTitle}` : `Processing started: ${quizTitle}`,
      {
        body: lang === 'vi' ? 'AI đang tạo quiz của bạn. Bạn sẽ được thông báo khi hoàn tất.' : 'The AI is generating your quiz. You will be notified upon completion.',
        tag: jobId,
      }
    );
    
    const updateJob = (update: Partial<ProcessingJob>) => {
      setProcessingJobs(prev => prev.map(job => job.id === jobId ? { ...job, ...update } : job));
    };

    try {
        let groundingContent: string | undefined = undefined;
        if (shouldGenerateExplanations && selectedEntryIds.length > 0) {
            const relevantEntries = knowledgeEntries.filter(e => selectedEntryIds.includes(e.id));
            
            groundingContent = relevantEntries.map(e => {
                const textContent = (e.contentBlocks || [])
                    .filter(block => block.type === 'text')
                    .map(block => (block as { type: 'text', content: string }).content)
                    .join('\n');
                return `Title: ${e.title}\n\n${textContent}`;
            }).join('\n\n---\n\n');
        }
      
      const filePartsPromises = files.map(file => extractFileParts(file));
      const nestedParts = await Promise.all(filePartsPromises);
      const allParts = nestedParts.flat();

      if (controller.signal.aborted) return;
      
      if (allParts.length === 0 || (allParts.every(p => !p.text) && allParts.every(p => !p.inlineData))) {
        throw new Error(lang === 'vi' ? "Không thể trích xuất đủ nội dung từ các tệp." : "Could not extract enough content from the files.");
      }
      
      const generatedQuestions = await generateQuiz({
        fileParts: allParts, 
        selectedTypes, 
        modelName: selectedModel, 
        lang, 
        groundingContent, 
        integrateGeneralAI, 
        shouldGenerateExplanations, 
        useWebSearch,
        generationMode,
        questionCountModes,
        customQuestionCounts,
        difficultyLevels,
        difficultyCountModes,
        difficultyCounts,
      });

      if (controller.signal.aborted) return;

      if (generatedQuestions.length === 0) {
        throw new Error(lang === 'vi' ? "AI không thể tạo quiz từ các tệp này." : "The AI couldn't generate a quiz from these files.");
      }
      
      const newQuiz: GeneratedQuiz = { 
        id: `${Date.now()}-${quizTitle}`,
        title: quizTitle, 
        createdAt: new Date().toISOString(),
        questions: generatedQuestions,
        model: selectedModel
      };

      setGeneratedQuizzes(prevQuizzes => {
        const newQuizzes = [newQuiz, ...prevQuizzes];
        localStorage.setItem('generatedQuizzes', JSON.stringify(newQuizzes));
        return newQuizzes;
      });
      
      updateJob({ status: 'completed', result: newQuiz });
      sendNotification(
        lang === 'vi' ? `Tạo quiz thành công: ${quizTitle}` : `Quiz created: ${quizTitle}`,
        {
          body: lang === 'vi' ? 'Quiz của bạn đã sẵn sàng! Nhấn để xem.' : 'Your quiz is ready! Click to view.',
          tag: jobId,
        }
      );

    } catch (err) {
        if (controller.signal.aborted) {
            // The job status is already set to 'cancelled' in handleCancelJob.
            // No need to update it again here.
            return;
        }
        const errorMessage = err instanceof Error ? err.message : (lang === 'vi' ? 'Lỗi không xác định.' : 'An unknown error occurred.');
        console.error(err);
        updateJob({ status: 'error', error: errorMessage });
        sendNotification(
          lang === 'vi' ? `Lỗi xử lý: ${quizTitle}` : `Processing error: ${quizTitle}`,
          {
            body: errorMessage,
            tag: jobId
          }
        );
    }
  }, [lang, knowledgeEntries, sendNotification]);

  const handleFileSelect = useCallback((files: File[]) => {
    setPendingFiles(files);
    setAppState('modeSelection');
    setError(null);
  }, []);
  
  const handleModeSelect = useCallback((mode: GenerationMode) => {
    setGenerationMode(mode);
    setAppState('selectingTypes');
  }, []);

  const handleSelectionCancel = useCallback(() => {
    setPendingFiles(null);
    setGenerationMode(null);
    setAppState('upload');
  }, []);

  const handleSelectionConfirm = useCallback((
    quizTitle: string,
    selectedTypes: SelectableQuestionType[],
    shouldGenerateExplanations: boolean,
    selectedEntryIds: string[],
    integrateGeneralAI: boolean,
    selectedModel: GeminiModel,
    useWebSearch: boolean,
    generationMode: GenerationMode,
    questionCountModes: CustomQuestionCountModes,
    customQuestionCounts: CustomQuestionCounts,
    difficultyLevels: DifficultyLevels,
    difficultyCountModes: DifficultyCountModes,
    difficultyCounts: DifficultyCounts
  ) => {
    if (pendingFiles && pendingFiles.length > 0 && generationMode) {
      handleFileProcess(
        pendingFiles, 
        quizTitle, 
        selectedTypes, 
        shouldGenerateExplanations, 
        selectedEntryIds, 
        integrateGeneralAI, 
        selectedModel, 
        useWebSearch,
        generationMode,
        questionCountModes,
        customQuestionCounts,
        difficultyLevels,
        difficultyCountModes,
        difficultyCounts
      );
    }
    setPendingFiles(null);
    setGenerationMode(null);
    setAppState('upload');
  }, [pendingFiles, generationMode, handleFileProcess]);

  const handleAddPendingFiles = useCallback((files: File[]) => {
      setPendingFiles(prev => [...(prev || []), ...files]);
  }, []);

  const handleRemovePendingFile = useCallback((indexToRemove: number) => {
      setPendingFiles(prev => (prev || []).filter((_, index) => index !== indexToRemove));
  }, []);


  const handleCancelJob = useCallback((jobId: string) => {
    setProcessingJobs(prevJobs => {
        const jobToCancel = prevJobs.find(j => j.id === jobId);
        if (jobToCancel) {
            // Abort the controller to stop further processing after the API call.
            jobToCancel.controller.abort();
            
            sendNotification(
                lang === 'vi' ? `Đã hủy: ${jobToCancel.title}` : `Cancelled: ${jobToCancel.title}`,
                {
                    body: lang === 'vi' ? 'Quá trình tạo quiz đã bị hủy.' : 'The quiz generation process was cancelled.',
                    tag: jobToCancel.id
                }
            );

            // Immediately update the UI to reflect the cancellation.
            return prevJobs.map(j => 
                j.id === jobId ? { ...j, status: 'cancelled' } : j
            );
        }
        return prevJobs;
    });
  }, [lang, sendNotification]);

  const handleClearJobs = useCallback((jobIdsToClear: string[]) => {
    setProcessingJobs(prev => prev.filter(job => !jobIdsToClear.includes(job.id)));
  }, []);

  const handleJobCompleteClick = useCallback((quiz: GeneratedQuiz) => {
    setProcessingJobs(prev => prev.filter(j => j.result?.id !== quiz.id));
    
    if (quiz.questions.length === 0) {
        addNotification(lang === 'vi' ? 'Quiz được tạo không có câu hỏi nào và không thể bắt đầu.' : 'The generated quiz has no questions and cannot be started.', 'warning');
        window.scrollTo(0, 0);
        return;
    }
    
    setError(null);
    setUnprocessedQuiz(quiz);
    setAppState('settings');
  }, [lang, addNotification]);

  const handleStartQuiz = useCallback((config: QuizConfig, settings: { shuffleQuestions: boolean; shuffleOptions: boolean }) => {
    if (!unprocessedQuiz) return;
    
    let processedQuestions = unprocessedQuiz.questions;

    if (settings.shuffleQuestions) {
      processedQuestions = shuffleArray(processedQuestions);
    }
    if (settings.shuffleOptions) {
      processedQuestions = processedQuestions.map(q => {
        if (q.type === 'multiple-choice' && q.options) {
          const hasTrueFalse = q.options.some(opt => ['true', 'false'].includes(opt.toLowerCase()));
          if (!hasTrueFalse) {
            return { ...q, options: shuffleArray(q.options) };
          }
        }
        return q;
      });
    }

    const processedQuiz = { ...unprocessedQuiz, questions: processedQuestions };
    setCurrentQuiz(processedQuiz);
    setQuizConfig(config);
    setUserAnswers(processedQuiz.questions.map(q => q.type === 'multi-true-false' && q.subQuestions ? Array(q.subQuestions.length).fill(null) : null));
    setInitialDuration(0);
    setAppState('quiz');
  }, [unprocessedQuiz]);

  const calculateScore = (questions: GeneratedQuiz['questions'], finalAnswers: UserAnswers, smartCheckOutcomes?: Record<number, boolean>): number => {
    let score = 0;
    questions.forEach((question, index) => {
      const userAnswer = finalAnswers[index];
      if (question.type === 'multiple-choice') {
        if (userAnswer === question.answer) score++;
      } else if (question.type === 'multi-true-false' && question.subQuestions) {
        const userSubAnswers = userAnswer as ('True' | 'False')[];
        const isCompletelyCorrect = question.subQuestions.every((sub, subIndex) => userSubAnswers?.[subIndex] === sub.answer);
        if (isCompletelyCorrect) score++;
      } else if (question.type === 'short-answer') {
        const smartResult = smartCheckOutcomes?.[index];
        if (typeof smartResult === 'boolean') {
            if (smartResult) score++;
        } else {
            if (typeof userAnswer === 'string' && typeof question.answer === 'string' && userAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase()) {
              score++;
            }
        }
      }
    });
    return score;
  };

  const handleQuizFinish = useCallback((finalAnswers: UserAnswers, duration: number, smartCheckOutcomes: Record<number, boolean>) => {
    if(!currentQuiz || !quizConfig) return;

    const score = calculateScore(currentQuiz.questions, finalAnswers, smartCheckOutcomes);

    const newAttempt: QuizAttempt = {
      id: `${Date.now()}-attempt`,
      quizId: currentQuiz.id,
      quizTitle: currentQuiz.title,
      date: new Date().toISOString(),
      score,
      totalQuestions: currentQuiz.questions.length,
      userAnswers: finalAnswers,
      duration,
      status: 'completed',
      config: quizConfig,
      smartCheckOutcomes,
    };

    setQuizAttempts(prevAttempts => {
        const newAttempts = [newAttempt, ...prevAttempts];
        localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
        return newAttempts;
    });
    setUserAnswers(finalAnswers);
    setReviewData(null); // Clear any previous review data
    setAppState('results');
  }, [currentQuiz, quizConfig]);

  const handleQuizSaveAndExit = useCallback((finalAnswers: UserAnswers, duration: number, smartCheckOutcomes: Record<number, boolean>) => {
    if (!currentQuiz || !quizConfig) return;

    const score = calculateScore(currentQuiz.questions, finalAnswers, smartCheckOutcomes);
    
    const newAttempt: QuizAttempt = {
      id: `${Date.now()}-attempt-inprogress`,
      quizId: currentQuiz.id,
      quizTitle: currentQuiz.title,
      date: new Date().toISOString(),
      score,
      totalQuestions: currentQuiz.questions.length,
      userAnswers: finalAnswers,
      duration,
      status: 'in-progress',
      config: quizConfig,
      smartCheckOutcomes,
    };

    setQuizAttempts(prevAttempts => {
      const newAttempts = [newAttempt, ...prevAttempts];
      localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
      return newAttempts;
    });

    handleGoHome();
  }, [currentQuiz, quizConfig]);

  const handleGoHome = useCallback(() => {
    setAppState('upload');
    setCurrentQuiz(null);
    setUnprocessedQuiz(null);
    setUserAnswers([]);
    setError(null);
    setReviewData(null);
    setQuizToEdit(null);
    setCurrentKnowledgeBaseId(null);
    setInitialDuration(0);
    setPendingFiles(null);
    setGenerationMode(null);
  }, []);

  const handleRetake = useCallback(() => {
    const quizToRetake = reviewData ? reviewData.quiz : currentQuiz;
    if (quizToRetake) {
      setUnprocessedQuiz(quizToRetake);
      setAppState('settings');
    }
  }, [currentQuiz, reviewData]);
  
  const handleStartFromHistory = useCallback((quiz: GeneratedQuiz) => {
    if (quiz.questions.length === 0) {
        addNotification(lang === 'vi' ? 'Quiz này không có câu hỏi nào.' : 'This quiz has no questions.', 'warning');
        window.scrollTo(0, 0);
        return;
    }
    setError(null);
    setUnprocessedQuiz(quiz);
    setAppState('settings');
  }, [lang, addNotification]);

  const handleResumeAttempt = useCallback((attempt: QuizAttempt) => {
    const quizToResume = generatedQuizzes.find(q => q.id === attempt.quizId);
    if (quizToResume && attempt.config) {
      // Find the old in-progress attempt and remove it, as a new one will be created on save/finish
      setQuizAttempts(prev => {
        const newAttempts = prev.filter(a => a.id !== attempt.id);
        localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
        return newAttempts;
      });
      
      setCurrentQuiz(quizToResume);
      setQuizConfig(attempt.config);
      setUserAnswers(attempt.userAnswers);
      setInitialDuration(attempt.duration);
      setAppState('quiz');
    } else {
      setError(lang === 'vi' ? 'Không thể tiếp tục. Dữ liệu bài làm hoặc quiz gốc bị thiếu.' : 'Could not resume. Original quiz or attempt data is missing.');
    }
  }, [generatedQuizzes, lang]);

  const handleReviewAttempt = useCallback((attempt: QuizAttempt) => {
    const quiz = generatedQuizzes.find(q => q.id === attempt.quizId);
    if (quiz) {
      setUnprocessedQuiz(quiz);
      setReviewData({ quiz, attempt });
      setAppState('results');
    } else {
      setError(lang === 'vi' ? 'Không tìm thấy bộ quiz gốc cho lần làm bài này. Nó có thể đã bị xóa.' : `Could not find the original quiz for this attempt. It might have been deleted.`);
    }
  }, [generatedQuizzes, lang]);
  
  const handleDeleteAttemptAndExit = useCallback((attemptId: string) => {
    setQuizAttempts(prev => {
      const newAttempts = prev.filter(a => a.id !== attemptId);
      localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
      return newAttempts;
    });
    handleGoHome();
  }, [handleGoHome]);


  const handleStartEditing = useCallback((quiz: GeneratedQuiz) => {
    setQuizToEdit(quiz);
    setAppState('editing');
  }, []);

  const handleCreateNewQuiz = useCallback(() => {
    const newQuiz: GeneratedQuiz = {
      id: `${Date.now()}-manual`,
      title: lang === 'vi' ? 'Quiz không tên' : 'Untitled Quiz',
      createdAt: new Date().toISOString(),
      questions: [],
      model: 'gemini-flash-latest', // Default model for manual creation
    };
    setQuizToEdit(newQuiz);
    setAppState('editing');
  }, [lang]);

  const handleSaveChanges = useCallback((updatedQuiz: GeneratedQuiz) => {
    setGeneratedQuizzes(prev => {
        const existingQuiz = prev.find(q => q.id === updatedQuiz.id);
        let newQuizzes;
        if (existingQuiz) {
          // It's an update
          newQuizzes = prev.map(q => q.id === updatedQuiz.id ? updatedQuiz : q);
        } else {
          // It's a new quiz
          newQuizzes = [updatedQuiz, ...prev];
        }
        localStorage.setItem('generatedQuizzes', JSON.stringify(newQuizzes));
        return newQuizzes;
    });
    setQuizToEdit(null);
    handleGoHome();
  }, [handleGoHome]);

  const handleCreateFolder = useCallback((name: string) => {
    const newFolder: Folder = {
      id: `${Date.now()}-folder`,
      name,
    };
    setFolders(prev => {
      const newFolders = [newFolder, ...prev];
      localStorage.setItem('quizFolders', JSON.stringify(newFolders));
      return newFolders;
    });
  }, []);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    setFolders(prev => {
      const newFolders = prev.map(f => f.id === folderId ? { ...f, name: newName } : f);
      localStorage.setItem('quizFolders', JSON.stringify(newFolders));
      return newFolders;
    });
  }, []);
  
  const handleMoveQuizzes = useCallback((quizIds: string[], folderId: string) => {
    setGeneratedQuizzes(prev => {
      const newQuizzes = prev.map(q => {
        if (quizIds.includes(q.id)) {
          if (folderId === '__uncategorized__') {
            const { folderId: _, ...rest } = q;
            return rest;
          }
          return { ...q, folderId: folderId };
        }
        return q;
      });
      localStorage.setItem('generatedQuizzes', JSON.stringify(newQuizzes));
      return newQuizzes;
    });
  }, []);

  const handleDeleteQuizzes = useCallback((quizIds: string[]) => {
    setGeneratedQuizzes(prev => {
      const newQuizzes = prev.filter(q => !quizIds.includes(q.id));
      localStorage.setItem('generatedQuizzes', JSON.stringify(newQuizzes));
      return newQuizzes;
    });
    setQuizAttempts(prev => {
        const newAttempts = prev.filter(a => !quizIds.includes(a.quizId));
        localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
        return newAttempts;
    });
  }, []);

  const handleDeleteAttempts = useCallback((attemptIds: string[]) => {
    setQuizAttempts(prev => {
      const newAttempts = prev.filter(a => !attemptIds.includes(a.id));
      localStorage.setItem('quizAttempts', JSON.stringify(newAttempts));
      return newAttempts;
    });
  }, []);

  const handleDeleteFolders = useCallback((folderIds: string[]) => {
    setFolders(prev => {
      const newFolders = prev.filter(f => !folderIds.includes(f.id));
      localStorage.setItem('quizFolders', JSON.stringify(newFolders));
      return newFolders;
    });
    // Un-categorize quizzes in the deleted folder
    setGeneratedQuizzes(prev => {
        const newQuizzes = prev.map(q => {
            if (q.folderId && folderIds.includes(q.folderId)) {
                const { folderId: _, ...rest } = q;
                return rest;
            }
            return q;
        });
        localStorage.setItem('generatedQuizzes', JSON.stringify(newQuizzes));
        return newQuizzes;
    });
  }, []);

  // --- Knowledge Base Handlers ---
  const handleCreateKnowledgeBase = useCallback((name: string) => {
    const newKB: KnowledgeBase = {
      id: `${Date.now()}-kb`,
      name,
      createdAt: new Date().toISOString(),
    };
    setKnowledgeBases(prev => {
      const newKBs = [newKB, ...prev];
      localStorage.setItem('knowledgeBases', JSON.stringify(newKBs));
      return newKBs;
    });
  }, []);

  const handleRenameKnowledgeBase = useCallback((id: string, newName: string) => {
    setKnowledgeBases(prev => {
      const newKBs = prev.map(kb => kb.id === id ? { ...kb, name: newName } : kb);
      localStorage.setItem('knowledgeBases', JSON.stringify(newKBs));
      return newKBs;
    });
  }, []);
  
  const handleDeleteKnowledgeBase = useCallback((kbId: string) => {
    setKnowledgeBases(prev => {
      const newKBs = prev.filter(kb => kb.id !== kbId);
      localStorage.setItem('knowledgeBases', JSON.stringify(newKBs));
      return newKBs;
    });
    setKnowledgeEntries(prev => {
      const newEntries = prev.filter(e => e.knowledgeBaseId !== kbId);
      localStorage.setItem('knowledgeEntries', JSON.stringify(newEntries));
      return newEntries;
    })
  }, []);

  const handleSelectKnowledgeBase = useCallback((kbId: string) => {
    setCurrentKnowledgeBaseId(kbId);
    setAppState('knowledgeBaseView');
  }, []);
  
  const handleSaveKnowledgeEntry = useCallback((entry: KnowledgeEntry) => {
    setKnowledgeEntries(prev => {
      const existing = prev.find(e => e.id === entry.id);
      const now = new Date().toISOString();
      let newEntries;
      if (existing) {
        newEntries = prev.map(e => e.id === entry.id ? { ...entry, lastModified: now } : e);
      } else {
        newEntries = [{ ...entry, createdAt: now, lastModified: now }, ...prev];
      }
      localStorage.setItem('knowledgeEntries', JSON.stringify(newEntries));
      return newEntries;
    });
  }, []);
  
  const handleDeleteKnowledgeEntry = useCallback((entryId: string) => {
     setKnowledgeEntries(prev => {
      const newEntries = prev.filter(e => e.id !== entryId);
      localStorage.setItem('knowledgeEntries', JSON.stringify(newEntries));
      return newEntries;
    });
  }, []);


  const renderContent = () => {
    switch (appState) {
      case 'modeSelection':
        return <ModeSelectionView onSelectMode={handleModeSelect} onCancel={handleGoHome} lang={lang} fileCount={pendingFiles?.length || 0} />;
      case 'selectingTypes':
        if (pendingFiles && generationMode) return <QuizTypeSelectionView files={pendingFiles} onAddFiles={handleAddPendingFiles} onRemoveFile={handleRemovePendingFile} generationMode={generationMode} knowledgeBases={knowledgeBases} knowledgeEntries={knowledgeEntries} onConfirm={handleSelectionConfirm} onCancel={handleSelectionCancel} lang={lang} setZoomedImageUrl={setZoomedImageUrl} />;
        setAppState('upload');
        return null;
      case 'settings':
        if (unprocessedQuiz) return <SettingsView quiz={unprocessedQuiz} onStartQuiz={handleStartQuiz} onBack={handleGoHome} lang={lang}/>;
        return null;
      case 'quiz':
        // FIX: Corrected the function name from 'handleSaveAndExit' to 'handleQuizSaveAndExit' to resolve a 'Cannot find name' error.
        if (currentQuiz && quizConfig) return <QuizView key={currentQuiz.id} quiz={currentQuiz} config={quizConfig} onQuizFinish={handleQuizFinish} onSaveAndExit={handleQuizSaveAndExit} onBack={handleGoHome} initialDuration={initialDuration} initialAnswers={userAnswers} lang={lang} setZoomedImageUrl={setZoomedImageUrl} />;
        return null; 
      case 'results':
        const attemptForReview = reviewData ? reviewData.attempt : quizAttempts[0];
        const quizForReview = reviewData ? reviewData.quiz : currentQuiz;
        if(quizForReview && attemptForReview) {
          return <ResultsView 
            questions={quizForReview.questions}
            attempt={attemptForReview}
            onGoHome={handleGoHome}
            onRetake={handleRetake}
            onDeleteAttemptAndExit={handleDeleteAttemptAndExit}
            isReview={!!reviewData}
            lang={lang}
            setZoomedImageUrl={setZoomedImageUrl}
          />;
        }
        return null;
      case 'editing':
        if (quizToEdit) return <EditQuizView 
          key={quizToEdit.id} 
          initialQuiz={quizToEdit} 
          onSave={handleSaveChanges} 
          onCancel={handleGoHome} 
          lang={lang} 
          knowledgeBases={knowledgeBases}
          knowledgeEntries={knowledgeEntries}
          setZoomedImageUrl={setZoomedImageUrl}
        />;
        return null;
      case 'knowledgeBaseView':
        const currentKB = knowledgeBases.find(kb => kb.id === currentKnowledgeBaseId);
        if (currentKB) {
            const entriesForKB = knowledgeEntries.filter(e => e.knowledgeBaseId === currentKnowledgeBaseId);
            return <KnowledgeBaseView 
                knowledgeBase={currentKB}
                entries={entriesForKB}
                onBack={handleGoHome}
                onSaveEntry={handleSaveKnowledgeEntry}
                onDeleteEntry={handleDeleteKnowledgeEntry}
                onRenameKnowledgeBase={handleRenameKnowledgeBase}
                lang={lang}
            />
        }
        return null;
      case 'upload':
      default:
        return (
          <>
            <FileUpload onFileSelect={handleFileSelect} error={error} lang={lang} />
            <HistoryView 
              lang={lang}
              generatedQuizzes={generatedQuizzes} 
              quizAttempts={quizAttempts}
              folders={folders}
              knowledgeBases={knowledgeBases}
              onStart={handleStartFromHistory} 
              onReviewAttempt={handleReviewAttempt}
              onResumeAttempt={handleResumeAttempt}
              onEdit={handleStartEditing}
              onAddNewQuiz={handleCreateNewQuiz}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onMoveQuizzes={handleMoveQuizzes}
              onDeleteQuizzes={handleDeleteQuizzes}
              onDeleteAttempts={handleDeleteAttempts}
              onDeleteFolders={handleDeleteFolders}
              onCreateKnowledgeBase={handleCreateKnowledgeBase}
              onRenameKnowledgeBase={handleRenameKnowledgeBase}
              onDeleteKnowledgeBase={handleDeleteKnowledgeBase}
              onSelectKnowledgeBase={handleSelectKnowledgeBase}
            />
          </>
        );
    }
  };

  const isMainView = appState === 'upload';

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 font-sans text-text-main relative main-bg-gradient">
      <div className="fixed top-6 right-6 z-50 w-full max-w-sm space-y-2">
          {notifications.map(n => (
              <NotificationToast key={n.id} notification={n} onDismiss={() => removeNotification(n.id)} />
          ))}
      </div>

      {isMainView && <GlobalSettings theme={theme} setTheme={setTheme} lang={lang} setLang={handleSetLang}/>}
      {isMainView && (
          <PendingJobsView 
            jobs={processingJobs} 
            onCancel={handleCancelJob} 
            onClear={handleClearJobs}
            onCompleteClick={handleJobCompleteClick}
            lang={lang} 
          />
      )}
      <div className="w-full max-w-4xl mx-auto flex-grow flex flex-col justify-center">
        {isMainView && (
          <header className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2 animate-fade-in title-animated-gradient">
              {lang === 'vi' ? 'Trình tạo Quiz AI' : 'AI Quiz Generator'}
            </h1>
            <p className="text-text-subtle text-sm animate-fade-in h-8 flex items-center justify-center" style={{ animationDelay: '0.2s' }}>
                <span key={currentTipIndex} className="animate-fade-in">
                    <LatexRenderer text={tips[lang][currentTipIndex]} />
                </span>
            </p>
          </header>
        )}
        <main className={!isMainView ? 'animate-slide-in' : ''}>
          {renderContent()}
        </main>
      </div>

      <footer className="w-full text-center text-text-subtle py-4">
        <div className="flex flex-col items-center gap-2">
          <a 
            href="https://www.facebook.com/share/1D6qZCFEP6/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-2 hover:text-text-main transition-colors text-sm"
            aria-label="Visit Facebook profile"
          >
            <span className="font-semibold">Made by Hoang</span>
            <FacebookIcon className="w-5 h-5 text-blue-500" />
          </a>
          <div className="text-xs flex items-center gap-2">
            <a href="mailto:hoangthanhlich0905@gmail.com" className="hover:text-text-main transition-colors">hoangthanhlich0905@gmail.com</a>
            <span className="text-border-color">|</span>
            <a href="tel:0862561454" className="hover:text-text-main transition-colors">0862561454</a>
          </div>
        </div>
      </footer>

      {zoomedImageUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-fade-in" onClick={() => setZoomedImageUrl(null)}>
            <div className="relative max-w-[90vw] max-h-[90vh]">
                <img src={zoomedImageUrl} alt={lang === 'vi' ? 'Chế độ xem phóng to' : 'Zoomed view'} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                <button onClick={() => setZoomedImageUrl(null)} className="absolute -top-3 -right-3 bg-base-200 text-text-main rounded-full p-2 hover:bg-base-300 transition-colors shadow-lg" aria-label={lang === 'vi' ? 'Đóng' : 'Close'}>
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;