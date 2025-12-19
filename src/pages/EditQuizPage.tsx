import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Question, Quiz } from "../types";
import { ParsedQuestion } from "../utils/docsParser";
import { toast } from "react-hot-toast";
import QuizPreview from "../components/QuizPreview";
import MathText from "../components/MathText";
import UnassignedImagesGallery from "../components/UnassignedImagesGallery";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { ImagesAPI } from "../utils/api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LocationState {
  questions: ParsedQuestion[];
  fileName: string;
  fileId: string;
  classId?: string; // For CreateClassPage
  classInfo?: {
    isNew: boolean;
    name?: string;
    description?: string;
    classId?: string;
  };
  quizTitle?: string;
  quizDescription?: string;
  isEdit?: boolean;
  unassignedImages?: import('../types').ExtractedImage[]; // Images not yet assigned to questions
}

// Extended Question interface to support images
interface QuestionWithImages extends Question {
  questionImage?: string; // Base64 encoded image for question
  optionImages?: { [key: string]: string }; // Map of option text to base64 image
}

// Image upload component
const ImageUpload: React.FC<{
  onImageUpload: (imageData: string) => void;
  currentImage?: string;
  placeholder?: string;
  className?: string;
  onAssignFromGallery?: (imageId: string) => void;
  onImageRemoved?: (imageData: string) => void;
}> = ({
  onImageUpload,
  currentImage,
  placeholder = "Thêm ảnh",
  className = "",
  onAssignFromGallery,
  onImageRemoved,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    };

    const handleFile = async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Vui lòng chọn file ảnh");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        toast.error("Kích thước ảnh không được vượt quá 5MB");
        return;
      }

      try {
        // Upload ảnh lên server và nhận URL
        toast.loading("Đang upload ảnh...");
        const { ImagesAPI } = await import("../utils/api");
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          throw new Error("Vui lòng đăng nhập để upload ảnh");
        }
        const imageUrl = await ImagesAPI.upload(file, token);
        toast.dismiss();
        toast.success("Upload ảnh thành công!");
        onImageUpload(imageUrl);
      } catch (error) {
        toast.dismiss();
        console.error("Upload error:", error);
        toast.error("Lỗi khi upload ảnh: " + (error as Error).message);
      }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      // Check if dropping from UnassignedImagesGallery (ID based)
      const unassignedId = event.dataTransfer.getData('image/unassigned-id');
      if (unassignedId) {
        if (onAssignFromGallery) {
          onAssignFromGallery(unassignedId);
          return;
        }
      }

      // Otherwise handle as file drop
      const file = event.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              handleFile(file);
            }
            break;
          }
        }
      }
    };

    const removeImage = () => {
      const imgToRestore = currentImage; // Capture current image before clearing
      onImageUpload(""); // Clear UI immediately

      if (imgToRestore && onImageRemoved) {
        // Use timeout to separate the restore action from the delete action
        setTimeout(() => {
          onImageRemoved(imgToRestore);
        }, 50);
      }
    };

    return (
      <div className={className}>
        {currentImage ? (
          <div className="relative group">
            <img
              src={currentImage}
              alt="Uploaded"
              className="max-w-full max-h-48 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600"
            />
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={removeImage}
                className="bg-red-600 text-white p-1 rounded-full hover:bg-red-700 shadow-lg"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 transition-colors group"
            tabIndex={0}
          >
            <div className="flex flex-col items-center space-y-2">
              <svg
                className="w-8 h-8 text-gray-400 group-hover:text-primary-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-primary-600 dark:text-primary-400">
                  {placeholder}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Click, kéo thả hoặc Ctrl+V để thêm ảnh
              </div>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  };

const EditQuizPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;

  const [questions, setQuestions] = useState<QuestionWithImages[]>([]);
  const [quizTitle, setQuizTitle] = useState(state?.quizTitle || "");
  const [quizDescription, setQuizDescription] = useState(
    state?.quizDescription || ""
  );
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Undo/Redo State Manager
  const {
    state: editorState,
    set: setEditorState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo({
    content: "",
    unassignedImages: state?.unassignedImages || [],
    pastedImagesMap: {} as Record<string, string>,
  });

  // Lưu trữ edited state của từng câu hỏi để tránh mất dữ liệu khi scroll/remount
  // eslint-disable-next-line
  const editedQuestionsMapRef = useRef<Map<string, QuestionWithImages>>(new Map());
  // Lưu lại thông tin vị trí phần tử để giữ nguyên viewport sau các thao tác chỉnh sửa
  const scrollAnchorRef = useRef<{
    id: string;
    offsetTop: number;
    ts: number;
  } | null>(null);

  // Derived state for compatibility
  const previewContent = editorState.content;
  const unassignedImages = editorState.unassignedImages;
  const pastedImagesMap = editorState.pastedImagesMap;

  // Helpers to lookup ID from Data (Reverse Map)
  // Memoize this if performance becomes an issue
  const findImageIdByData = (data: string, overrideMap?: Record<string, string>): string | undefined => {
    if (!data) return undefined;

    // Check override map first (used during initial load)
    if (overrideMap) {
      for (const [id, value] of Object.entries(overrideMap)) {
        if (value === data) return id;
      }
    }

    // Check pastedImagesMap
    for (const [id, value] of Object.entries(pastedImagesMap)) {
      if (value === data) return id;
    }
    // Check unassignedImages (though less likely to be used for assigned question)
    const foundInGallery = unassignedImages.find((img) => img.data === data);
    if (foundInGallery) return foundInGallery.id;
    return undefined;
  };

  // State Setters Wrappers
  const setPreviewContent = (action: string | ((prev: string) => string)) => {
    setEditorState((prev) => {
      const newContent =
        typeof action === "function" ? action(prev.content) : action;

      return {
        ...prev,
        content: newContent,
        // Don't filter unassignedImages here based on text interaction.
        // We recalculate unassignedImages in handlePreviewEdit based on PARSED questions.
      };
    });
  };

  const setUnassignedImages = (
    action:
      | import("../types").ExtractedImage[]
      | ((
        prev: import("../types").ExtractedImage[]
      ) => import("../types").ExtractedImage[])
  ) => {
    setEditorState((prev) => ({
      ...prev,
      unassignedImages:
        typeof action === "function" ? action(prev.unassignedImages) : action,
    }));
  };

  const setPastedImagesMap = (
    action:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>)
  ) => {
    setEditorState((prev) => ({
      ...prev,
      pastedImagesMap:
        typeof action === "function" ? action(prev.pastedImagesMap) : action,
    }));
  };

  // Handler to remove image from unassigned list when assigned/deleted
  // Note: Also remove from text to keep sync
  const handleImageAssigned = (imageId: string) => {
    setEditorState((prev) => {
      // Remove from unassigned
      const newUnassigned = prev.unassignedImages.filter((img) => img.id !== imageId);

      // Remove from content IF it exists there (orphaned tag)
      // Escaping for regex: [ and ] need escaping
      const regex = new RegExp(`\\[IMAGE:${imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
      const newContent = prev.content.replace(regex, '');

      return {
        ...prev,
        content: newContent,
        unassignedImages: newUnassigned,
      };
    });
  };

  // Explicit Delete from Gallery (permanently remove)
  const handleImageDeleted = (imageId: string) => {
    setEditorState((prev) => {
      // Remove from unassigned
      const newUnassigned = prev.unassignedImages.filter((img) => img.id !== imageId);

      // Remove from map
      const newMap = { ...prev.pastedImagesMap };
      delete newMap[imageId];

      // Remove from content
      // Escaping for regex: [ and ] need escaping
      const regex = new RegExp(`\\[IMAGE:${imageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
      const newContent = prev.content.replace(regex, '');

      return {
        ...prev,
        content: newContent,
        pastedImagesMap: newMap,
        unassignedImages: newUnassigned,
      };
    });

    // Also trigger parse to update Left Preview immediately
    // We can't access newContent easily from setEditorState callback result outside.
    // So we assume state update triggers re-render, but questions need explicit update.
    // Actually, we can just run parse on the PREDICTED new content.
    // Or better: Use useEffect to watch content? No, risky.
    // Let's just do it manually.
    setTimeout(() => {
      setEditorState(currentState => {
        const parsed = parseEditedContent(currentState.content);
        setQuestions(parsed);
        return currentState;
      });
    }, 0);
  };

  const handleAssignImage = (imageId: string, callback: (data: string) => void) => {
    const img = unassignedImages.find((i) => i.id === imageId);
    if (img) {
      callback(img.data);
      // Delay removal slightly
      setTimeout(() => {
        handleImageAssigned(imageId);
      }, 100);
      toast.success("Đã gán ảnh!");
    } else {
      toast.error("Không tìm thấy dữ liệu ảnh!");
    }
  };

  const handleRestoreToGallery = (imageData: string) => {
    if (!imageData) return;

    // Always restore the image, generating a new ID
    const newImage: import("../types").ExtractedImage = {
      id: `restored-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data: imageData,
      // position is undefined for restored images
    };
    setUnassignedImages((prev) => [...prev, newImage]);
    toast.success("Ảnh đã được đưa về kho!");
  };

  const setScrollAnchor = (questionId: string) => {
    const element = document.querySelector<HTMLElement>(`[data-qid="${questionId}"]`);
    if (!element) {
      scrollAnchorRef.current = null;
      return;
    }
    const rect = element.getBoundingClientRect();
    scrollAnchorRef.current = {
      id: questionId,
      offsetTop: rect.top,
      ts: Date.now(),
    };
  };

  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;

    const element = document.querySelector<HTMLElement>(`[data-qid="${anchor.id}"]`);
    scrollAnchorRef.current = null;
    if (!element) return;

    // Giữ phần tử tại cùng offsetTop so với viewport
    const rect = element.getBoundingClientRect();
    const delta = rect.top - anchor.offsetTop;
    if (Math.abs(delta) > 1) {
      window.scrollBy({ top: delta, behavior: "auto" });
    }
  });

  const handlePastedImages = (newImages: Record<string, string>) => {
    // FIX Issue 3: Wrap both state updates in single setEditorState for atomic undo/redo
    // This ensures when user presses CTRL+Z, both pastedImagesMap AND unassignedImages
    // revert together, completely removing the pasted image from all locations
    setEditorState(prev => {
      const newExtractedImages = Object.entries(newImages).map(([id, data]) => ({
        id,
        data
      }));

      return {
        ...prev,
        pastedImagesMap: { ...prev.pastedImagesMap, ...newImages },
        unassignedImages: [...prev.unassignedImages, ...newExtractedImages]
      };
    });
    toast.success(`Đã nhận diện ${Object.keys(newImages).length} ảnh từ bộ nhớ tạm`);
  };

  // Hàm xử lý khi nội dung preview được chỉnh sửa
  const handlePreviewEdit = (content: string) => {
    setPreviewContent(content);
    // Parse nội dung và cập nhật questions
    // Parse content
    const parsedQuestions = parseEditedContent(content);

    // Identify used images from parsed questions
    const usedImageIds = new Set<string>();
    parsedQuestions.forEach(q => {
      if (q.questionImage) {
        const id = findImageIdByData(q.questionImage);
        if (id) usedImageIds.add(id);
      }
      if (q.optionImages) {
        Object.values(q.optionImages).forEach(img => {
          const id = findImageIdByData(img);
          if (id) usedImageIds.add(id);
        });
      }
      if (q.subQuestions) {
        q.subQuestions.forEach(sq => {
          if ((sq as any).questionImage) {
            const id = findImageIdByData((sq as any).questionImage);
            if (id) usedImageIds.add(id);
          }
          if ((sq as any).optionImages) {
            Object.values((sq as any).optionImages).forEach((img: any) => {
              const id = findImageIdByData(img);
              if (id) usedImageIds.add(id);
            });
          }
        });
      }
    });

    // Recalculate Unassigned Images: All pasted images - Used images
    // Note: pastedImagesMap (state) contains all potential images.
    setEditorState(prev => {
      const allImages = prev.pastedImagesMap;
      const potentialUnassignedIds = Object.keys(allImages).filter(id => !usedImageIds.has(id));
      const newUnassigned = potentialUnassignedIds.map(id => ({
        id,
        data: allImages[id]
      }));

      return {
        ...prev,
        content, // Sync content here as well to be safe (setPreviewContent does it but async/batched)
        unassignedImages: newUnassigned
      };
    });

    setQuestions(parsedQuestions);

    // Auto-save logic handles the rest
  };

  // Need to re-run parse if pastedImagesMap changes, but actually handlePreviewEdit triggers on text change.
  // We should trigger a re-parse when images are pasted too? 
  // But updating state inside `handlePastedImages` will trigger re-render, 
  // relying on `previewContent` state which should be current?
  // Let's use useEffect to re-parse when pastedImagesMap changes? 
  // Ideally `previewContent` is the source of truth.
  useEffect(() => {
    if (previewContent) {
      const parsed = parseEditedContent(previewContent);
      setQuestions(parsed);
    }
  }, [pastedImagesMap]);

  // Hàm parse nội dung text thành questions
  // SỬ DỤNG GIỐNG HỆT LOGIC CỦA docsParser.parseDocsContent
  const parseEditedContent = (content: string): QuestionWithImages[] => {
    // Pre-process: Normalize smart quotes and newlines (giống docsParser)
    let normalizedContent = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
      .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes

    // Heuristic: Inject newlines trước một số patterns
    normalizedContent = normalizedContent
      // Inject newline trước "Câu n:"
      .replace(/([^\n])\s+(Câu\s+\d+|Câu\s*:)/gi, '$1\n$2')
      // Keywords đặc biệt
      // Keywords đặc biệt
      .replace(/([^\n])\s*(result:|group:|{ |^{|}$| }|}$)/gm, '$1\n$2')
      // Remove image placeholder tags
      .replace(/<hình ảnh>/g, "");

    const lines = normalizedContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsedQuestions: QuestionWithImages[] = [];

    let currentQuestion: Partial<QuestionWithImages> = {};
    let currentOptions: string[] = [];
    let currentCorrectAnswers: string[] | Record<string, string> = [];

    // State for Composite (Parent/Child)
    let isCollectingComposite = false;
    let compositeBuffer: string[] = [];
    let compositeBraceCount = 0;

    // Generate unique ID helper
    const generateId = (): string => {
      return `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };

    // Determine question type helper
    const determineQuestionType = (
      correctAnswers: string[] | Record<string, string>,
      options?: string[]
    ): "single" | "multiple" | "text" => {
      // Ưu tiên check options trước
      if (Array.isArray(options) && options.length > 0) {
        if (Array.isArray(correctAnswers) && correctAnswers.length > 1) {
          return "multiple";
        }
        return "single";
      }

      if (Array.isArray(correctAnswers)) {
        if (correctAnswers.length === 0) {
          return "text";
        } else if (correctAnswers.length === 1) {
          return "single";
        } else {
          return "multiple";
        }
      }
      return "text";
    };

    // TÌM ẢNH TỪ QUESTIONS CŨ DỰA VÀO ID HOẶC PASTED MAP
    // Helper find image by ID
    const findImage = (imgId: string): string | undefined => {
      // 1. Check pasted/unassigned
      if (pastedImagesMap[imgId]) return pastedImagesMap[imgId];
      const inUnassigned = unassignedImages.find(u => u.id === imgId);
      if (inUnassigned) return inUnassigned.data;
      return undefined;
    };

    const flushQuestion = () => {
      // Only flush if we have a question text
      if (currentQuestion.question) {
        // TÌM ẢNH TỪ QUESTIONS CŨ DỰA VÀO ID
        const existingQuestion = questions.find(
          (q) => q.id === currentQuestion.id
        );

        // Default ID if missing
        if (!currentQuestion.id) {
          currentQuestion.id = generateId();
        }

        // Determine type if not explicitly set (e.g. by group/result parsing)
        if (!currentQuestion.type) {
          currentQuestion.type = determineQuestionType(currentCorrectAnswers, currentOptions);
        }

        // Construct final object
        const q: QuestionWithImages = {
          id: currentQuestion.id!,
          question: currentQuestion.question,
          type: currentQuestion.type as any,
          correctAnswers: Array.isArray(currentCorrectAnswers) && currentCorrectAnswers.length > 0
            ? currentCorrectAnswers
            : (currentQuestion.correctAnswers || []),
          explanation: currentQuestion.explanation,
          subQuestions: currentQuestion.subQuestions,
          questionImage: currentQuestion.questionImage || existingQuestion?.questionImage,
          optionImages: {
            ...(existingQuestion?.optionImages || {}),
            ...(currentQuestion.optionImages || {})
          },
        } as QuestionWithImages;

        // Assign options based on type
        if (q.type === 'drag' && currentQuestion.options) {
          q.options = currentQuestion.options;
          // Correct answers for drag should be map, usually handled in group parsing.
          if (currentQuestion.correctAnswers) {
            q.correctAnswers = currentQuestion.correctAnswers;
          }
        } else if (q.type !== 'text' && q.type !== 'composite') {
          q.options = currentOptions;
        }

        parsedQuestions.push(q);
      }

      // Reset state
      currentQuestion = {};
      currentOptions = [];
      currentCorrectAnswers = [];
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // CHECK FOR IMAGE MARKER [IMAGE:id]
      // Use loop to handle multiple images on same line (though we prefer newlines)
      // And use global regex
      const imgRegex = /\[IMAGE:([^\]]+)\]/g;
      let imgMatchIterator;
      while ((imgMatchIterator = imgRegex.exec(line)) !== null) {
        const imgId = imgMatchIterator[1];
        const imgData = findImage(imgId);

        if (imgData) {
          // If currently parsing options, assign to last option
          if (currentOptions.length > 0) {
            const lastOption = currentOptions[currentOptions.length - 1];
            if (!currentQuestion.optionImages) currentQuestion.optionImages = {};
            currentQuestion.optionImages[lastOption] = imgData;
          } else {
            // Assign to question
            // Support composite sub-question image?
            // "flushQuestion" uses currentQuestion.questionImage.
            // If inside composite, currentQuestion is the sub-question.
            currentQuestion.questionImage = imgData;
          }
        }
      }
      // Remove all markers
      line = line.replace(imgRegex, "").trim();
      if (!line) continue; // Skip line if it only contained the image markers

      // --- COMPOSITE BLOCK HANDLING ---
      if (isCollectingComposite) {
        // Check for braces to handle nesting (simple counter)
        const openCount = (line.match(/{/g) || []).length;
        const closeCount = (line.match(/}/g) || []).length;

        compositeBraceCount += openCount - closeCount;

        if (compositeBraceCount <= 0) {
          // End of composite block
          isCollectingComposite = false;

          // Recursively parse buffer
          if (compositeBuffer.length > 0) {
            const subQs = parseEditedContent(compositeBuffer.join("\n"));
            currentQuestion.subQuestions = subQs;
            currentQuestion.type = "composite";
            flushQuestion();
          }
          compositeBuffer = [];
        } else {
          compositeBuffer.push(line);
        }
        continue;
      }

      // Check start of Composite Block
      if (line === "{" && currentQuestion.question) {
        isCollectingComposite = true;
        compositeBraceCount = 1;
        continue;
      }

      // --- STANDARD PARSING ---

      // 1. Explicit ID (Optional)
      if (line.startsWith("ID:")) {
        if (currentQuestion.question) flushQuestion();

        const idMatch = line.match(/ID:\s*([\w-]+)/);
        currentQuestion = {
          id: idMatch ? idMatch[1] : generateId()
        };
        continue;
      }

      // 2. Question Text (Câu n:)
      if (line.match(/^Câu\s+\d+|Câu\s*:/i) || (line.startsWith("Câu") && line.includes(":"))) {
        if (currentQuestion.question) flushQuestion();

        // Extract text after colon
        const colonIndex = line.indexOf(":");
        const text = line.substring(colonIndex + 1).trim();

        // Inherit ID if set, otherwise gen
        if (!currentQuestion.id) currentQuestion.id = generateId();
        currentQuestion.question = text;
        continue;
      }

      // 3. Options (A. B. C. D.) — ROBUST PARSER
      const optionRegex = /([*]?)([A-E])\.\s*/g;
      let match: RegExpExecArray | null;

      const optionMatches: {
        isCorrect: boolean;
        index: number;
        length: number;
      }[] = [];

      while ((match = optionRegex.exec(line)) !== null) {
        optionMatches.push({
          isCorrect: match[1] === "*",
          index: match.index,
          length: match[0].length,
        });
      }

      if (optionMatches.length > 0) {
        for (let i = 0; i < optionMatches.length; i++) {
          const start = optionMatches[i].index + optionMatches[i].length;
          const end =
            i + 1 < optionMatches.length
              ? optionMatches[i + 1].index
              : line.length;

          const content = line.substring(start, end).trim();

          if (content.length > 0) {
            currentOptions.push(content);
            if (optionMatches[i].isCorrect && Array.isArray(currentCorrectAnswers)) {
              (currentCorrectAnswers as string[]).push(content);
            }
          }
        }
        continue;
      }

      // --- HELPER FOR MULTI-LINE ---
      const isNewBlock = (line: string) => {
        // 1. ID
        if (line.startsWith("ID:")) return true;
        // 2. Question (Câu n:)
        if (line.match(/^Câu\s+\d+|Câu\s*:/i) || (line.startsWith("Câu") && line.includes(":"))) return true;
        // 3. Keywords (result:, group:)
        if (line.match(/^(result|group):/i)) return true;
        // 4. Structural ({, })
        if (line === "{" || line === "}") return true;
        // 5. Options (*A., A.)
        if (line.match(/^[*]?\s*[A-Z]\.\s*/)) return true;

        return false;
      };

      const accumulateLines = (startIdx: number): { content: string, nextIdx: number } => {
        let content = lines[startIdx].replace(/^(result|group):/i, '').trim();
        let nextIdx = startIdx + 1;

        while (nextIdx < lines.length) {
          const nextLine = lines[nextIdx];
          if (isNewBlock(nextLine)) {
            break;
          }
          content += " " + nextLine;
          nextIdx++;
        }

        return { content: content.trim(), nextIdx: nextIdx - 1 };
      };

      // 4. Fill-in / Drag Result (result: ...)
      if (line.match(/^result:/i)) {
        const { content, nextIdx } = accumulateLines(i);
        i = nextIdx; // Update loop index

        // Check if array -> Drag Items
        if (content.startsWith("[") && content.endsWith("]")) {
          try {
            // Normalize quotes is done at top, but ensure JSON valid format
            const items = JSON.parse(content);

            // Init dragging options structure
            const dragItems = items.map((t: string) => ({ id: t, label: t }));

            currentQuestion.type = 'drag';
            currentQuestion.options = {
              items: dragItems,
              targets: [] // will be filled by group:
            };
          } catch (e) {
            console.warn("Failed to parse result array", e);
            // Fallback to text
            currentCorrectAnswers = [content];
            currentQuestion.type = 'text';
          }
        } else {
          // Simple text result
          currentCorrectAnswers = [content];
          currentQuestion.type = 'text';
        }
        continue;
      }

      // 5. Group Definition (group: ...)
      if (line.match(/^group:/i)) {
        const { content, nextIdx } = accumulateLines(i);
        i = nextIdx; // Update loop index

        const targets: any[] = [];
        const mapping: Record<string, string> = {};

        // Improved Regex: handles quotes inside keys/values better
        const regex = /\("([^"]+)"\s*:\s*(\[[^\]]+\])\)/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
          const targetLabel = match[1];
          const itemsJson = match[2]; // quotes already normalized

          const targetId = targetLabel;
          targets.push({ id: targetId, label: targetLabel });

          try {
            const items = JSON.parse(itemsJson);
            items.forEach((item: string) => {
              mapping[item] = targetId;
            });
          } catch (e) {
            console.warn("Error parsing group items", e);
          }
        }

        if (currentQuestion.options && typeof currentQuestion.options === 'object' && !Array.isArray(currentQuestion.options)) {
          currentQuestion.options.targets = targets;
        } else {
          currentQuestion.options = { items: [], targets: targets };
        }

        currentQuestion.correctAnswers = mapping;
        currentQuestion.type = 'drag';
        continue;
      }
    }

    // Flush last question
    flushQuestion();

    // FIX Issue 2: Re-index all images from parsed questions to prevent disappearance
    // This ensures that images present in questions (from initial parse or edits) 
    // are properly indexed in pastedImagesMap so findImage() can locate them
    // NOTE: We do NOT add to unassignedImages here - that's handled by setPreviewContent
    // which removes assigned images from the gallery when they appear in [IMAGE:id] tags
    parsedQuestions.forEach(q => {
      // Index question image if it exists and has valid data
      if (q.questionImage && q.questionImage.trim()) {
        const existingId = findImageIdByData(q.questionImage);
        if (!existingId) {
          // Image data exists but not in map - generate new ID and index it
          const newId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          setPastedImagesMap(prev => ({ ...prev, [newId]: q.questionImage! }));
        }
      }

      // Index option images if they exist
      if (q.optionImages && typeof q.optionImages === 'object') {
        Object.values(q.optionImages).forEach(imgData => {
          if (imgData && typeof imgData === 'string' && imgData.trim()) {
            const existingId = findImageIdByData(imgData);
            if (!existingId) {
              // Image data exists but not in map - generate new ID and index it
              const newId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
              setPastedImagesMap(prev => ({ ...prev, [newId]: imgData }));
            }
          }
        });
      }

      // Recursively process subQuestions for composite questions
      if (q.subQuestions && Array.isArray(q.subQuestions)) {
        q.subQuestions.forEach(subQ => {
          // Index sub-question image
          if (subQ.questionImage && subQ.questionImage.trim()) {
            const existingId = findImageIdByData(subQ.questionImage);
            if (!existingId) {
              const newId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
              setPastedImagesMap(prev => ({ ...prev, [newId]: subQ.questionImage! }));
            }
          }

          // Index sub-question option images
          if (subQ.optionImages && typeof subQ.optionImages === 'object') {
            Object.values(subQ.optionImages).forEach(imgData => {
              if (imgData && typeof imgData === 'string' && imgData.trim()) {
                const existingId = findImageIdByData(imgData);
                if (!existingId) {
                  const newId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                  setPastedImagesMap(prev => ({ ...prev, [newId]: imgData }));
                }
              }
            });
          }
        });
      }
    });

    return parsedQuestions;
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);

        const reorderedQuestions = arrayMove(items, oldIndex, newIndex);

        // Cập nhật preview content sau khi sắp xếp lại
        setTimeout(() => {
          const newPreviewContent = generatePreviewContent(reorderedQuestions);
          setPreviewContent(newPreviewContent);
        }, 0);

        toast.success("Đã thay đổi thứ tự câu hỏi!");
        return reorderedQuestions;
      });
    }
  };

  // Helper: Convert base64 to File object
  const base64ToFile = (base64: string, filename: string): File => {
    const arr = base64.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // Helper: Upload base64 images and replace with URLs
  const uploadImagesInQuestions = async (questions: any[]): Promise<any[]> => {
    const processedQuestions = [];

    for (let i = 0; i < questions.length; i++) {
      const q = { ...questions[i] };

      // Upload questionImage if base64
      if (q.questionImage && q.questionImage.startsWith("data:image/")) {
        try {
          const file = base64ToFile(q.questionImage, `question-${i}.png`);
          const { getToken } = await import("../utils/auth");
          const token = getToken();
          const url = await ImagesAPI.upload(file, token!);
          q.questionImage = url;
          console.log(`✓ Uploaded questionImage for Q${i + 1}: ${url}`);
        } catch (error) {
          console.error(
            `✗ Failed to upload questionImage for Q${i + 1}:`,
            error
          );
          toast.error(`Ảnh câu hỏi ${i + 1} lỗi upload. Vui lòng thử lại!`);
        }
      }

      // Upload optionImages if base64
      if (q.optionImages) {
        const newOptionImages: any = Array.isArray(q.optionImages) ? [] : {};

        if (Array.isArray(q.optionImages)) {
          // Array format
          for (let j = 0; j < q.optionImages.length; j++) {
            const img = q.optionImages[j];
            if (img && img.startsWith("data:image/")) {
              try {
                const file = base64ToFile(img, `question-${i}-option-${j}.png`);
                const { getToken } = await import("../utils/auth");
                const token = getToken();
                const url = await ImagesAPI.upload(file, token!);
                newOptionImages[j] = url;
                console.log(
                  `✓ Uploaded optionImage for Q${i + 1} option ${j}: ${url}`
                );
              } catch (error) {
                console.error(
                  `✗ Failed to upload optionImage for Q${i + 1} option ${j}:`,
                  error
                );
                newOptionImages[j] = img; // Keep original on error
              }
            } else {
              newOptionImages[j] = img; // Already URL or null
            }
          }
        } else {
          // Object format {optionText: imageData}
          for (const [key, img] of Object.entries(q.optionImages)) {
            if (
              img &&
              typeof img === "string" &&
              img.startsWith("data:image/")
            ) {
              try {
                const file = base64ToFile(img, `question-${i}-${key}.png`);
                const { getToken } = await import("../utils/auth");
                const token = getToken();
                const url = await ImagesAPI.upload(file, token!);
                newOptionImages[key] = url;
                console.log(
                  `✓ Uploaded optionImage for Q${i + 1} "${key}": ${url}`
                );
              } catch (error) {
                console.error(
                  `✗ Failed to upload optionImage for Q${i + 1} "${key}":`,
                  error
                );
                newOptionImages[key] = img; // Keep original on error
                toast.error(`Ảnh đáp án "${key}" (câu ${i + 1}) lỗi upload.`);
              }
            } else {
              newOptionImages[key] = img; // Already URL or null
            }
          }
        }

        q.optionImages = newOptionImages;
      }

      processedQuestions.push(q);
    }

    return processedQuestions;
  };

  const handlePublish = async () => {
    try {
      setIsPublishing(true);

      // Validation: Phải có ít nhất 1 câu hỏi
      if (questions.length === 0) {
        alert("Vui lòng thêm ít nhất một câu hỏi trước khi xuất bản");
        return;
      }

      // Validation và làm sạch dữ liệu trước khi xuất bản
      const invalidQuestions: string[] = [];
      const cleanedQuestions = questions.map((q, i) => {
        if (!q.question.trim()) {
          invalidQuestions.push(`Câu ${i + 1}: Chưa có nội dung câu hỏi`);
          return q;
        }

        if (q.type === "text") {
          const ca = Array.isArray(q.correctAnswers)
            ? (q.correctAnswers as string[])
            : [];
          if (!ca[0]?.trim()) {
            invalidQuestions.push(
              `Câu ${i + 1}: Câu hỏi tự luận chưa có đáp án đúng`
            );
          }
          return q;
        } else if (q.type === "drag") {
          const opt = (q.options as any) || { targets: [], items: [] };
          const targets: any[] = Array.isArray(opt.targets)
            ? opt.targets.filter((t: any) => (t.label || "").trim())
            : [];
          const items: any[] = Array.isArray(opt.items)
            ? opt.items.filter((t: any) => (t.label || "").trim())
            : [];
          const rawMap = (q.correctAnswers as Record<string, string>) || {};
          // Làm sạch mapping: chỉ giữ mapping tới target tồn tại và item tồn tại
          const targetSet = new Set(targets.map((t) => t.id));
          const itemSet = new Set(items.map((it) => it.id));
          const cleanedMap: Record<string, string> = {};
          Object.entries(rawMap).forEach(([itemId, targetId]) => {
            if (itemSet.has(itemId) && targetSet.has(targetId)) {
              cleanedMap[itemId] = targetId;
            }
          });

          // Cho phép 1 nhóm trở lên
          if (targets.length < 1)
            invalidQuestions.push(
              `Câu ${i + 1}: Kéo thả cần ít nhất 1 nhóm đích`
            );
          if (items.length < 1)
            invalidQuestions.push(`Câu ${i + 1}: Kéo thả cần ít nhất 1 đáp án`);
          // Không bắt buộc phải map hết - đáp án không map = không thuộc nhóm nào

          // Trả về câu hỏi drag đã được làm sạch
          return {
            ...q,
            options: { targets, items },
            correctAnswers: cleanedMap,
          };
        } else if (q.type === "composite") {
          // Validate composite question
          const subQuestions = q.subQuestions || [];
          if (subQuestions.length === 0) {
            invalidQuestions.push(
              `Câu ${i + 1}: Câu hỏi mẹ cần ít nhất 1 câu hỏi con`
            );
            return q;
          }

          // Validate each sub-question
          subQuestions.forEach((subQ, subIdx) => {
            if (!subQ.question.trim()) {
              invalidQuestions.push(
                `Câu ${i + 1} - Câu con ${subIdx + 1}: Chưa có nội dung câu hỏi`
              );
            }

            if (subQ.type === "text") {
              const ca = Array.isArray(subQ.correctAnswers)
                ? (subQ.correctAnswers as string[])
                : [];
              if (!ca[0]?.trim()) {
                invalidQuestions.push(
                  `Câu ${i + 1} - Câu con ${subIdx + 1}: Chưa có đáp án đúng`
                );
              }
            } else {
              const validOpts = Array.isArray(subQ.options)
                ? (subQ.options as string[]).filter((opt: string) => opt.trim())
                : [];
              if (validOpts.length < 2) {
                invalidQuestions.push(
                  `Câu ${i + 1} - Câu con ${subIdx + 1}: Cần ít nhất 2 đáp án`
                );
              }
              const ca = Array.isArray(subQ.correctAnswers)
                ? (subQ.correctAnswers as string[])
                : [];
              const validCorrect = ca.filter((ans: string) =>
                validOpts.includes(ans)
              );
              if (validCorrect.length === 0) {
                invalidQuestions.push(
                  `Câu ${i + 1} - Câu con ${subIdx + 1}: Chưa chọn đáp án đúng`
                );
              }
            }
          });

          return q;
        } else {
          const validOptions: string[] = Array.isArray(q.options)
            ? (q.options as string[]).filter((opt: string) => opt.trim())
            : [];
          if (validOptions.length < 2) {
            invalidQuestions.push(
              `Câu ${i + 1}: Câu hỏi trắc nghiệm cần ít nhất 2 đáp án`
            );
          }
          const ca = Array.isArray(q.correctAnswers)
            ? (q.correctAnswers as string[])
            : [];
          const validCorrectAnswers = ca.filter((ans: string) =>
            validOptions.includes(ans)
          );
          if (validCorrectAnswers.length === 0) {
            invalidQuestions.push(`Câu ${i + 1}: Chưa chọn đáp án đúng`);
          }
          return q;
        }
      });

      if (invalidQuestions.length > 0) {
        alert(`Vui lòng sửa các lỗi sau:\n\n${invalidQuestions.join("\n")}`);
        return;
      }

      // Upload all base64 images first and replace with URLs
      console.log("Uploading images before publishing...");
      const questionsWithUrls = await uploadImagesInQuestions(cleanedQuestions);
      console.log("All images uploaded successfully!");

      // Nếu có token, ưu tiên lưu về backend
      const { getToken } = await import("../utils/auth");
      const token = getToken();

      // Nếu là chỉnh sửa quiz (isEdit)
      if (state?.isEdit && token) {
        const { QuizzesAPI } = await import("../utils/api");
        await QuizzesAPI.update(
          state.fileId,
          {
            title: quizTitle || `Quiz từ file ${state.fileName}`,
            description:
              quizDescription || "Bài trắc nghiệm từ tài liệu đã tải lên",
            // giữ nguyên trạng thái published hiện tại (không thay đổi khi chỉnh sửa)
            questions: questionsWithUrls,
          },
          token
        );
        localStorage.removeItem("quiz_edit_progress");
        toast.success("Cập nhật quiz thành công!");
        navigate("/classes");
        return;
      } else if (state?.isEdit) {
        alert("Vui lòng đăng nhập để chỉnh sửa quiz.");
        return;
      }

      // Backend path: tạo/ghi quiz và lớp nếu có token
      if (token) {
        const { ClassesAPI, QuizzesAPI } = await import("../utils/api");
        // Resolve classId: create class if needed
        let classId: string | undefined = undefined;
        if (state.classInfo) {
          if (state.classInfo.isNew) {
            const created = await ClassesAPI.create(
              {
                name:
                  state.classInfo.name ||
                  quizTitle ||
                  `Lớp học ${state.fileName}`,
                description:
                  state.classInfo.description ||
                  quizDescription ||
                  "Lớp học được tạo từ quiz",
                isPublic: false,
              },
              token
            );
            classId = created.id;
          } else {
            classId = state.classInfo.classId;
          }
        }
        if (!classId) {
          // Default: create class implicitly
          const created = await ClassesAPI.create(
            {
              name: quizTitle || `Lớp học ${state.fileName}`,
              description: quizDescription || "Lớp học được tạo từ quiz",
              isPublic: false,
            },
            token
          );
          classId = created.id;
        }

        await QuizzesAPI.create(
          {
            classId,
            title: quizTitle || `Quiz từ file ${state.fileName}`,
            description:
              quizDescription || "Bài trắc nghiệm từ tài liệu đã tải lên",
            published: false, // mặc định Private khi tạo mới
            questions: questionsWithUrls,
          },
          token
        );
        localStorage.removeItem("quiz_edit_progress");
        toast.success("Xuất bản thành công!");
        navigate("/classes");
        return;
      }

      alert("Vui lòng đăng nhập để xuất bản quiz.");
    } catch (error) {
      console.error("Error publishing quiz:", error);
      toast.error("Có lỗi xảy ra khi xuất bản");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCancel = () => {
    if (window.confirm("Bạn có chắc chắn muốn hủy bỏ mọi thay đổi?\n\nTất cả các chỉnh sửa chưa lưu sẽ bị mất và trạng thái sẽ quay về như cũ.")) {
      localStorage.removeItem("quiz_edit_progress");
      navigate("/classes"); // Or navigate(-1) but explicit path is safer for "cancel" action
    }
  };

  useEffect(() => {
    console.log("EditQuizPage: received state", state);

    if (!state) {
      console.log("No state provided, redirecting");
      toast.error("Không có thông tin quiz");
      navigate("/create");
      return;
    }

    // Kiểm tra xem có phải là manual quiz không (từ nút "Tạo bài trắc nghiệm")
    if (
      state.fileName === "Quiz thủ công" &&
      (!state.questions || state.questions.length === 0)
    ) {
      console.log("Manual quiz - initializing empty questions");
      setQuestions([]);
      setQuizTitle("Quiz thủ công");
      setQuizDescription("Bài trắc nghiệm tạo thủ công");
      setPreviewContent("");
      return;
    }

    // Với file upload - cần có câu hỏi
    if (!state?.questions || state.questions.length === 0) {
      console.log("No questions found, redirecting");
      toast.error("Không có câu hỏi nào được tải lên");
      navigate("/create");
      return;
    }

    // Chuyển đổi ParsedQuestion thành QuestionWithImages
    const convertedQuestions: QuestionWithImages[] = state.questions.map(
      (q) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
        correctAnswers: q.correctAnswers,
        explanation: q.explanation,
        subQuestions: q.subQuestions, // Giữ lại subQuestions nếu có
        questionImage: (q as any).questionImage, // Giữ lại ảnh câu hỏi nếu có
        optionImages: (q as any).optionImages, // Giữ lại ảnh đáp án nếu có
      })
    );
    setQuestions(convertedQuestions);

    // Extract existing images to initial map
    const initialImagesMap: Record<string, string> = {};

    // Helper to extract
    const extract = (imgData?: string) => {
      if (!imgData) return;
      // Check if already in map (duplicate image usage)
      for (const val of Object.values(initialImagesMap)) {
        if (val === imgData) return;
      }

      // Generate stable ID? Or random. 
      // User wants to see [IMAGE:...] which implies ID.
      // If it's a URL, maybe use filename? But base64 needs ID.
      // Let's generate a random ID for editor session.
      const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      initialImagesMap[id] = imgData;
    };

    convertedQuestions.forEach(q => {
      extract(q.questionImage);
      if (q.optionImages) {
        Object.values(q.optionImages).forEach(extract);
      }
      if (q.subQuestions) {
        q.subQuestions.forEach(sq => {
          extract((sq as any).questionImage);
          if ((sq as any).optionImages) {
            Object.values((sq as any).optionImages).forEach((v: any) => extract(v));
          }
        });
      }
    });

    // Merge with existing Unassigned Images if any (to avoid ID conflicts? Unassigned usually have IDs already)
    // But pastedImagesMap is for "Assigned" images mostly.

    // Khởi tạo preview content WITH the map
    const initialPreviewContent = generatePreviewContent(convertedQuestions, initialImagesMap);

    // Update Editor State directly
    setEditorState(prev => ({
      ...prev,
      content: initialPreviewContent,
      pastedImagesMap: {
        ...prev.pastedImagesMap,
        ...initialImagesMap
      }
    }));

    // REDUNDANT: setPreviewContent calls setEditorState, but we need atomic update with MAP.
    // So we skip setPreviewContent(initialPreviewContent) and use setEditorState above.
    // However, the original code had setPreviewContent(initialPreviewContent).
    // Let's comment it out or remove it.
    // setPreviewContent(initialPreviewContent); 

    // Thiết lập title và description dựa trên nguồn dữ liệu
    if (state.classInfo && state.classInfo.isNew && state.classInfo.name) {
      // Từ CreateClassPage với thông tin lớp mới - SỬ DỤNG THÔNG TIN TỪ CREATECLASSPAGE
      setQuizTitle(state.classInfo.name);
      setQuizDescription(
        state.classInfo.description ||
        `Bài trắc nghiệm từ tài liệu ${state.fileName}`
      );
    } else if (state.classInfo && state.classInfo.name) {
      // Từ DocumentsPage với classInfo.name - SỬ DỤNG THÔNG TIN TỪ DOCUMENTSPAGE
      setQuizTitle(state.classInfo.name);
      setQuizDescription(
        state.classInfo.description ||
        `Bài trắc nghiệm từ tài liệu ${state.fileName}`
      );
    } else {
      // Mặc định - sử dụng tên file
      setQuizTitle(`Quiz từ file ${state.fileName}`);
      setQuizDescription(`Bài trắc nghiệm từ tài liệu ${state.fileName}`);
    }
  }, [state, navigate]);

  // Auto-save edit progress
  useEffect(() => {
    if (!state) return;

    const saveProgress = () => {
      // Don't save if we don't have questions or title yet (initial render)
      if (questions.length === 0 && !quizTitle) return;

      const dataToSave = {
        type: 'edit',
        timestamp: Date.now(),
        // Save component state
        questions,
        quizTitle,
        quizDescription,
        // Save original location state to restore context (fileId, classInfo, etc.)
        state: {
          ...state,
          quizTitle, // Update with current values
          quizDescription,
          questions: questions.map(q => ({
            // Convert back to ParsedQuestion format if needed, but keeping extra fields is fine
            id: q.id,
            question: q.question,
            type: q.type,
            options: q.options,
            correctAnswers: q.correctAnswers,
            explanation: q.explanation,
            subQuestions: q.subQuestions,
            // IMPORTANT: Exclude images to avoid localStorage quota exceeded
            // questionImage: q.questionImage,
            // optionImages: q.optionImages
          }))
        },
        className: state.classInfo?.name || "",
        quizId: state.fileId, // Using fileId as identifier
        originalTitle: state.quizTitle || quizTitle // Save original title for display in Resumer
      };

      try {
        localStorage.setItem("quiz_edit_progress", JSON.stringify(dataToSave));
      } catch (error) {
        console.warn("Failed to save progress to localStorage:", error);
        // Silently fail - don't interrupt user experience
      }
    };

    const timer = setTimeout(saveProgress, 1000); // Debounce save
    return () => clearTimeout(timer);
  }, [questions, quizTitle, quizDescription, state]);

  const handleQuestionEdit = (questionId: string) => {
    setScrollAnchor(questionId);
    // Khôi phục edited state nếu có (từ lần edit trước)
    const question = questions.find(q => q.id === questionId);
    if (question && !editedQuestionsMapRef.current.has(questionId)) {
      // Lưu state hiện tại của câu hỏi vào map
      editedQuestionsMapRef.current.set(questionId, { ...question });
    }

    // Mở editor
    setIsEditing(questionId);
  };

  const handleQuestionSave = (
    questionId: string,
    updatedQuestion: Partial<QuestionWithImages>
  ) => {
    console.log("Saving question:", questionId, updatedQuestion); // Debug log

    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id === questionId) {
          // ensure restore target follows saved question id
          const result = { ...q, ...updatedQuestion };

          // Đảm bảo câu hỏi text không có options
          if (result.type === "text") {
            result.options = undefined; // Xóa options cho câu hỏi text
            // Đảm bảo luôn có ít nhất 1 đáp án trống cho câu hỏi text
            if (!result.correctAnswers || result.correctAnswers.length === 0) {
              result.correctAnswers = [""];
            }
            // KHÔNG reset correctAnswers - giữ nguyên dữ liệu đã được truyền vào từ updatedQuestion
          } else {
            // Đối với câu hỏi trắc nghiệm, đảm bảo có options
            if (!result.options || result.options.length === 0) {
              result.options = ["", "", "", ""];
            }
          }

          // Cập nhật map với dữ liệu đã lưu
          editedQuestionsMapRef.current.set(questionId, result);

          console.log("Question after save:", result); // Debug log
          return result;
        }
        return q;
      });

      console.log("Updated questions array:", updated); // Debug log
      setIsEditing(null);

      // Cập nhật preview content sau khi lưu câu hỏi
      setTimeout(() => {
        const newPreviewContent = generatePreviewContent(updated);
        setPreviewContent(newPreviewContent);
      }, 0);

      return updated;
    });
  };

  // Hàm tạo nội dung preview từ questions
  // TẠO CONTENT THEO ĐÚNG FORMAT CỦA docsParser
  const generatePreviewContent = (questionsArray: QuestionWithImages[], overrideMap?: Record<string, string>) => {
    let content = "";

    questionsArray.forEach((q, index) => {
      content += `ID: ${q.id}\n`;
      content += `Câu ${index + 1}: ${q.question}\n`;

      // Append Question Image Tag (NEW LINE)
      if (q.questionImage) {
        const imgId = findImageIdByData(q.questionImage, overrideMap);
        if (imgId) {
          content += `[IMAGE:${imgId}]`;
        }
      }
      content += `\n`; // End of Question Line

      if (q.type === "text") {
        // Format: result: <answer>
        const answers = Array.isArray(q.correctAnswers)
          ? (q.correctAnswers as string[]).filter((a) => a.trim())
          : [];
        if (answers.length > 0) {
          content += `result: ${answers[0]}\n`;
        }
      } else if (q.type === "composite") {
        // Format: { ... sub-questions ... }
        content += `{\n`;
        if (q.subQuestions && q.subQuestions.length > 0) {
          q.subQuestions.forEach((subQ, subIdx) => {
            content += `Câu ${subIdx + 1}: ${subQ.question}`;
            if ((subQ as any).questionImage) {
              const imgId = findImageIdByData((subQ as any).questionImage, overrideMap);
              if (imgId) content += `\n[IMAGE:${imgId}]`;
            }
            content += "\n";

            if (subQ.type === "text") {
              const answers = Array.isArray(subQ.correctAnswers)
                ? (subQ.correctAnswers as string[]).filter((a) => a.trim())
                : [];
              if (answers.length > 0) {
                content += `result: ${answers[0]}\n`;
              }
            } else if (Array.isArray(subQ.options)) {
              (subQ.options as string[]).forEach((opt, optIdx) => {
                const isCorrect =
                  Array.isArray(subQ.correctAnswers) &&
                  (subQ.correctAnswers as string[]).includes(opt);
                const prefix = isCorrect ? "*" : "";
                const letter = String.fromCharCode(65 + optIdx);
                content += `${prefix}${letter}. ${opt}`;

                if ((subQ as any).optionImages && (subQ as any).optionImages[opt]) {
                  const imgId = findImageIdByData((subQ as any).optionImages[opt], overrideMap);
                  if (imgId) content += `\n[IMAGE:${imgId}]`;
                }
                content += "\n";
              });
            }

            // Add blank line between sub-questions
            if (subIdx < q.subQuestions!.length - 1) {
              content += "\n";
            }
          });
        }
        content += `}\n`;
      } else if (q.type === "drag") {
        // Format: result: [...] \n group: (...)
        const dragOptions = q.options as any;
        if (dragOptions && dragOptions.items) {
          const itemLabels = dragOptions.items.map((item: any) => item.label || item.id);
          content += `result: ${JSON.stringify(itemLabels)}\n`;
        }

        if (dragOptions && dragOptions.targets && dragOptions.targets.length > 0) {
          // Build group: line from correctAnswers mapping
          const mapping = q.correctAnswers as Record<string, string>;
          const groupsByTarget: Record<string, string[]> = {};

          // Group items by their target
          dragOptions.targets.forEach((target: any) => {
            groupsByTarget[target.id] = [];
          });

          if (mapping) {
            Object.entries(mapping).forEach(([itemId, targetId]) => {
              if (groupsByTarget[targetId]) {
                groupsByTarget[targetId].push(itemId);
              } else {
                groupsByTarget[targetId] = [itemId];
              }
            });
          }

          // Format: group: ("Target1":["item1","item2"]), ("Target2":["item3"])
          const groupParts: string[] = [];
          dragOptions.targets.forEach((target: any) => {
            const targetLabel = target.label || target.id;
            const items = groupsByTarget[target.id] || [];
            groupParts.push(`("${targetLabel}":${JSON.stringify(items)})`);
          });

          if (groupParts.length > 0) {
            content += `group: ${groupParts.join(", ")}\n`;
          }
        }
      } else {
        // Single/Multiple choice: *A. B. *C. D.
        if (Array.isArray(q.options)) {
          q.options.forEach((option, optIndex) => {
            const isCorrect =
              Array.isArray(q.correctAnswers) &&
              q.correctAnswers.includes(option);
            const prefix = isCorrect ? "*" : "";
            const letter = String.fromCharCode(65 + optIndex);
            content += `${prefix}${letter}. ${option}`;

            // Append Option Image Tag if exists
            if (q.optionImages && q.optionImages[option]) {
              const imgId = findImageIdByData(q.optionImages[option], overrideMap);
              if (imgId) {
                content += `\n[IMAGE:${imgId}]`;
              }
            }
            content += `\n`;
          });
        }
      }

      content += "\n"; // Separator between questions
    });

    return content;
  };

  // Bind Undo/Redo Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if Input/Textarea is focused (unless it's the body/preview)
      // BUT we usually want Global Undo in this page?
      // If user is editing a specific input field, browser native undo might trigger.
      // We should only trigger custom undo if browser undo doesn't apply?
      // Or if we are capturing the "Whole Editor State".
      // Since we are syncing `previewContent` with `questions`, modifying a specific input updates `editedQuestion` (local state)
      // AND `handleQuestionSave` updates `editorState`.
      // So local edits inside `QuestionEditor` are NOT in `editorState` history UNTIL Saved.
      // This is a UX decision: Undo only works for "Saved/Committed" steps.
      // We should probably check if `isEditing` is null or if e.target is not an input?

      // Actually, user requested "CTRL+Z để khôi phục trạng thái nội dung editor".
      // If I am typing in a textarea, I want native undo.
      // If I am "viewing" or "drag dropping", I want Page Undo.

      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (isInput) return; // Let native behavior handle inputs

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) {
            redo();
            toast.success("Redo");
          }
        } else {
          if (canUndo) {
            undo();
            toast.success("Undo");
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canRedo) {
          redo();
          toast.success("Redo");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const handleQuestionDelete = (questionId: string) => {
    setQuestions((prev) => {
      const updated = prev.filter((q) => q.id !== questionId);
      // Cập nhật preview content
      setTimeout(() => {
        const newPreviewContent = generatePreviewContent(updated);
        setPreviewContent(newPreviewContent);
      }, 0);
      return updated;
    });
  };

  // Floating scroll buttons
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [canScroll, setCanScroll] = useState(true);
  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const body = document.documentElement;
      const viewH = window.innerHeight || 0;
      const docH = Math.max(body.scrollHeight, body.offsetHeight);
      const totalScrollable = Math.max(0, docH - viewH);
      const threshold = 80;
      const scrollable = totalScrollable > threshold;
      setCanScroll(scrollable);
      if (!scrollable) {
        // Avoid showing both buttons on short pages
        setAtTop(true);
        setAtBottom(true);
        return;
      }
      // Normalize edges to avoid overlap
      setAtTop(scrollY <= 10);
      setAtBottom(scrollY >= totalScrollable - 10);
    };
    // Defer first measurement until after first paint/content layout
    const rafId = requestAnimationFrame(onScroll);
    const tId = setTimeout(onScroll, 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
      clearTimeout(tId);
    };
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => {
    const body = document.documentElement;
    const docH = Math.max(body.scrollHeight, body.offsetHeight);
    window.scrollTo({ top: docH, behavior: "smooth" });
  };

  const handleAddQuestion = () => {
    const newQuestion: QuestionWithImages = {
      id: `q-${Date.now()}-${Math.random()}`,
      question: "",
      type: "single",
      options: ["", ""], // Bắt đầu với 2 đáp án trống
      correctAnswers: [],
      explanation: "",
      questionImage: undefined,
      optionImages: undefined,
    };
    setQuestions((prev) => {
      const updated = [...prev, newQuestion];
      // Cập nhật preview content
      setTimeout(() => {
        const newPreviewContent = generatePreviewContent(updated);
        setPreviewContent(newPreviewContent);
      }, 0);
      return updated;
    });
    setIsEditing(newQuestion.id);
  };

  // Component để wrap các câu hỏi với drag & drop
  const SortableQuestionItem: React.FC<{
    question: QuestionWithImages;
    index: number;
  }> = ({ question, index }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: question.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        className="relative group"
        data-qid={question.id}
        style={{ ...style, scrollMarginTop: 96 }}
      >
        {/* Question content */}
        <div className="hover:shadow-md transition-shadow duration-200">
          {isEditing === question.id ? (
            <QuestionEditor
              question={question}
              index={index}
              dragHandleProps={{ ...attributes, ...listeners }}
            />
          ) : (
            <QuestionDisplay
              question={question}
              index={index}
              dragHandleProps={{ ...attributes, ...listeners }}
            />
          )}
        </div>
      </div>
    );
  };

  const QuestionEditor: React.FC<{
    question: QuestionWithImages;
    index: number;
    dragHandleProps?: any;
  }> = ({ question, index, dragHandleProps }) => {
    // Buffer for images removed during this editing session.
    // They are only restored to gallery if the user explicitly saves.
    const [pendingRestores, setPendingRestores] = useState<string[]>([]);

    // Wrapper to flush restores before saving
    const saveAndFlush = (id: string, data: any) => {
      pendingRestores.forEach((img) => handleRestoreToGallery(img));
      setPendingRestores([]);
      handleQuestionSave(id, data);
    };

    const savedOptionsRef = useRef<string[]>(
      Array.isArray(question.options)
        ? (question.options as string[])
        : ["", ""]
    );

    // Lấy state từ map nếu có (từ lần edit trước), nếu không thì dùng question prop
    const getInitialState = (): QuestionWithImages => {
      const savedState = editedQuestionsMapRef.current.get(question.id);
      if (savedState) {
        return savedState;
      }

      // Khởi tạo state mới từ question prop
      if (
        question.type === "text" &&
        (!question.correctAnswers || question.correctAnswers.length === 0)
      ) {
        return {
          ...question,
          correctAnswers: [""], // Tạo 1 đáp án trống mặc định
        };
      }
      return question;
    };

    const [editedQuestion, _setEditedQuestion] = useState<QuestionWithImages>(getInitialState);
    const setEditedQuestion = (
      updater: React.SetStateAction<QuestionWithImages>
    ) => {
      // LUÔN GỌI SET ANCHOR TRƯỚC KHI CẬP NHẬT STATE TỪ TƯƠNG TÁC
      setScrollAnchor(question.id);
      _setEditedQuestion(updater);
    };

    // Lưu state vào map mỗi khi thay đổi để persist qua scroll/remount
    useEffect(() => {
      editedQuestionsMapRef.current.set(question.id, editedQuestion);
    }, [editedQuestion, question.id]);

    // Chỉ sync với prop khi question.id thay đổi (mở editor cho câu hỏi khác)
    // KHÔNG sync khi scroll/re-render cùng một câu hỏi
    useEffect(() => {
      // Nếu đã có state được lưu trong map, không sync với prop
      if (editedQuestionsMapRef.current.has(question.id)) {
        return;
      }

      // Câu hỏi mới - khởi tạo từ prop
      if (
        question.type === "text" &&
        (!question.correctAnswers || question.correctAnswers.length === 0)
      ) {
        const newState = {
          ...question,
          correctAnswers: [""],
        };
        _setEditedQuestion(newState);
        editedQuestionsMapRef.current.set(question.id, newState);
      } else {
        _setEditedQuestion(question);
        editedQuestionsMapRef.current.set(question.id, question);
      }

      // Luôn đảm bảo có ít nhất 2 options để backup
      const optionsBackup = Array.isArray(question.options)
        ? (question.options as string[])
        : ["", ""];
      savedOptionsRef.current =
        optionsBackup.length >= 2 ? optionsBackup : ["", ""];
    }, [question.id]);

    const handleSave = () => {
      // Kiểm tra dữ liệu trước khi lưu
      if (!editedQuestion.question.trim()) {
        alert("Vui lòng nhập nội dung câu hỏi");
        return;
      }

      console.log("Edited question before save:", editedQuestion); // Debug log

      if (editedQuestion.type === "text") {
        // Đối với câu hỏi text, đảm bảo có ít nhất một đáp án đúng
        const validAnswers = (editedQuestion.correctAnswers as string[]).filter(
          (answer: string) => answer?.trim()
        );
        if (validAnswers.length === 0) {
          alert("Vui lòng nhập ít nhất một đáp án đúng cho câu hỏi tự luận");
          return;
        }

        const updatedData = {
          ...editedQuestion,
          options: undefined, // Xóa options cho câu hỏi text
          correctAnswers: validAnswers, // Chỉ lưu các đáp án có nội dung
        };

        console.log("Saving text question with data:", updatedData); // Debug log
        setScrollAnchor(question.id);
        saveAndFlush(question.id, updatedData);
      } else if (editedQuestion.type === "drag") {
        // Lưu cấu trúc kéo thả: options.targets, options.items, correctAnswers là map itemId->targetId
        const dragOpt = (editedQuestion.options as any) || {
          targets: [],
          items: [],
        };
        const targets = Array.isArray(dragOpt.targets)
          ? dragOpt.targets.filter((t: any) => (t.label || "").trim())
          : [];
        const items = Array.isArray(dragOpt.items)
          ? dragOpt.items.filter((i: any) => (i.label || "").trim())
          : [];

        // Cho phép 1 nhóm trở lên (không bắt buộc 2 nhóm)
        if (targets.length < 1) {
          alert("Cần ít nhất 1 nhóm đích");
          return;
        }
        if (items.length < 1) {
          alert("Cần ít nhất 1 đáp án");
          return;
        }

        // Làm sạch mapping: chỉ giữ các itemId tồn tại và targetId thuộc danh sách targets
        const rawMap = ((editedQuestion.correctAnswers as any) || {}) as Record<string, string>;
        const targetSet = new Set(targets.map((t: any) => t.id));
        const itemSet = new Set(items.map((i: any) => i.id));
        const cleanedMap: Record<string, string> = {};
        Object.entries(rawMap).forEach(([itemId, targetId]) => {
          if (itemSet.has(itemId) && targetSet.has(targetId)) {
            cleanedMap[itemId] = targetId;
          }
        });

        const updatedData = {
          ...editedQuestion,
          options: { targets, items },
          correctAnswers: cleanedMap, // Không bắt buộc phải map hết
        };
        setScrollAnchor(question.id);
        saveAndFlush(question.id, updatedData);
      } else if (editedQuestion.type === "composite") {
        // Đối với câu hỏi mẹ
        const subQuestions = editedQuestion.subQuestions || [];
        if (subQuestions.length === 0) {
          alert("Câu hỏi mẹ cần có ít nhất 1 câu hỏi con");
          return;
        }

        // Kiểm tra từng câu hỏi con
        for (let i = 0; i < subQuestions.length; i++) {
          const subQ = subQuestions[i];
          if (!subQ.question.trim()) {
            alert(`Câu hỏi con ${i + 1}: Vui lòng nhập nội dung câu hỏi`);
            return;
          }

          if (subQ.type === "text") {
            const validAnswers = Array.isArray(subQ.correctAnswers)
              ? (subQ.correctAnswers as string[]).filter((a) => a.trim())
              : [];
            if (validAnswers.length === 0) {
              alert(
                `Câu hỏi con ${i + 1}: Vui lòng nhập ít nhất một đáp án đúng`
              );
              return;
            }
          } else {
            const validOpts = Array.isArray(subQ.options)
              ? (subQ.options as string[]).filter((opt) => opt.trim())
              : [];
            if (validOpts.length < 2) {
              alert(`Câu hỏi con ${i + 1}: Cần ít nhất 2 đáp án`);
              return;
            }
            const validCorrect = Array.isArray(subQ.correctAnswers)
              ? (subQ.correctAnswers as string[]).filter((ans) =>
                validOpts.includes(ans)
              )
              : [];
            if (validCorrect.length === 0) {
              alert(
                `Câu hỏi con ${i + 1}: Vui lòng chọn ít nhất một đáp án đúng`
              );
              return;
            }
          }
        }

        const updatedData = {
          ...editedQuestion,
          subQuestions: subQuestions,
        };

        console.log("Saving composite question with data:", updatedData); // Debug log
        setScrollAnchor(question.id);
        saveAndFlush(question.id, updatedData);
      } else {
        // Đối với câu hỏi trắc nghiệm
        const filteredOptions = (
          Array.isArray(editedQuestion.options)
            ? (editedQuestion.options as string[])
            : []
        ).filter((opt: string) => opt.trim() !== "");
        if (filteredOptions.length < 2) {
          alert("Câu hỏi trắc nghiệm cần ít nhất 2 đáp án");
          return;
        }

        const filteredCorrectAnswers = (
          Array.isArray(editedQuestion.correctAnswers)
            ? (editedQuestion.correctAnswers as string[])
            : []
        ).filter((ans: string) => filteredOptions.includes(ans));
        if (filteredCorrectAnswers.length === 0) {
          alert("Vui lòng chọn ít nhất một đáp án đúng");
          return;
        }

        const updatedData = {
          ...editedQuestion,
          options: filteredOptions,
          correctAnswers: filteredCorrectAnswers,
        };

        console.log("Saving multiple choice question with data:", updatedData); // Debug log
        setScrollAnchor(question.id);
        saveAndFlush(question.id, updatedData);
      }
    };

    const handleCancel = () => {
      // 1. Restore NEW images to gallery (added/changed during this session but discarded)
      const restoreIfNew = (imgData?: string, originalImgData?: string) => {
        if (imgData && imgData !== originalImgData) {
          handleRestoreToGallery(imgData);
        }
      };

      // 2. Reclaim ORIGINAL images from gallery (removed/replaced during this session but reclaimed by revert)
      const reclaimFromGallery = (currentData?: string, originalData?: string) => {
        if (originalData && currentData !== originalData) {
          // The original image was removed/replaced, so it's currently in the gallery.
          // Since we are cancelling, we revert to the original state (taking the image back).
          setUnassignedImages((prev) => {
            const idx = prev.findIndex(img => img.data === originalData);
            if (idx !== -1) {
              const newArr = [...prev];
              newArr.splice(idx, 1);
              return newArr;
            }
            return prev;
          });
        }
      };

      // Apply logic to Question Image
      restoreIfNew(editedQuestion.questionImage, question.questionImage);
      reclaimFromGallery(editedQuestion.questionImage, question.questionImage);

      // Apply logic to Option Images
      const currentOpts = editedQuestion.optionImages || {};
      const originalOpts = question.optionImages || {};

      // Iterate over all relevant keys
      const allKeys = Array.from(new Set([...Object.keys(currentOpts), ...Object.keys(originalOpts)]));
      allKeys.forEach((key) => {
        const currentVal = currentOpts[key];
        const originalVal = originalOpts[key];
        restoreIfNew(currentVal, originalVal);
        reclaimFromGallery(currentVal, originalVal);
      });

      setScrollAnchor(question.id);
      // Xóa state đã lưu khi cancel (khôi phục về state gốc)
      editedQuestionsMapRef.current.delete(question.id);
      _setEditedQuestion(question);
      setIsEditing(null);
    };

    const handleOptionChange = (index: number, value: string) => {
      const newOptions = [
        ...(Array.isArray(editedQuestion.options)
          ? (editedQuestion.options as string[])
          : []),
      ];
      newOptions[index] = value;
      setEditedQuestion((prev) => ({ ...prev, options: newOptions }));

      // Cập nhật luôn vào ref để giữ lại khi chuyển kiểu
      savedOptionsRef.current = newOptions;
    };

    const handleTypeChange = (
      newType: "single" | "multiple" | "text" | "drag" | "composite"
    ) => {
      setEditedQuestion((prev) => {
        if (newType === "text") {
          // Lưu options hiện tại vào ref trước khi ẩn
          savedOptionsRef.current = Array.isArray(prev.options)
            ? (prev.options as string[])
            : savedOptionsRef.current;

          // Nếu có đáp án đúng từ trắc nghiệm, chuyển sang text
          const caPrev = Array.isArray(prev.correctAnswers)
            ? (prev.correctAnswers as string[])
            : [];
          const existingCorrectAnswer = caPrev.length > 0 ? caPrev[0] : "";

          return {
            ...prev,
            type: "text",
            correctAnswers: existingCorrectAnswer
              ? [existingCorrectAnswer]
              : [""], // Đảm bảo luôn có ít nhất 1 đáp án trống
            options: undefined, // Xóa options khi chuyển sang text
          };
        } else if (newType === "drag") {
          return {
            ...prev,
            type: "drag",
            // Khởi tạo cấu trúc kéo thả tối thiểu
            options: {
              targets: [
                { id: "t1", label: "Nhóm A" },
                { id: "t2", label: "Nhóm B" },
              ],
              items: [
                { id: "i1", label: "Đáp án 1" },
                { id: "i2", label: "Đáp án 2" },
              ],
            },
            // Không gán sẵn nhóm cho bất kỳ đáp án nào; để trống mapping
            correctAnswers: {} as any,
          };
        } else if (newType === "composite") {
          return {
            ...prev,
            type: "composite",
            options: undefined,
            subQuestions: [],
            correctAnswers: [],
          } as any;
        } else {
          // Khôi phục options từ ref hoặc từ chính question
          const optionsToRestore = prev.options ||
            savedOptionsRef.current || ["", ""];
          // Đảm bảo có ít nhất 2 đáp án
          const finalOptions = (
            Array.isArray(optionsToRestore)
              ? optionsToRestore
              : savedOptionsRef.current
          ) as string[];
          const fixed = finalOptions.length >= 2 ? finalOptions : ["", ""];

          return {
            ...prev,
            type: newType,
            options: fixed,
            correctAnswers: [], // Reset correctAnswers khi chuyển về trắc nghiệm
          };
        }
      });
    };

    const handleCorrectAnswerToggle = (option: string) => {
      setEditedQuestion((prev) => {
        if (prev.type === "single") {
          // Với câu hỏi chọn 1 → chỉ chọn 1 đáp án
          return {
            ...prev,
            correctAnswers: [option] as any,
          };
        } else {
          // Với chọn nhiều → toggle như cũ
          const ca = Array.isArray(prev.correctAnswers)
            ? (prev.correctAnswers as string[])
            : [];
          const isSelected = ca.includes(option);
          const newCorrectAnswers = isSelected
            ? ca.filter((ans: string) => ans !== option)
            : [...ca, option];
          return {
            ...prev,
            correctAnswers: newCorrectAnswers as any,
          };
        }
      });
    };

    // Handle image uploads for question
    const handleQuestionImageUpload = (imageData: string) => {
      setEditedQuestion((prev) => ({
        ...prev,
        questionImage: imageData,
      }));
    };

    // Handle image uploads for options
    const handleOptionImageUpload = (optionText: string, imageData: string) => {
      setEditedQuestion((prev) => ({
        ...prev,
        optionImages: {
          ...prev.optionImages,
          [optionText]: imageData,
        },
      }));
    };

    return (
      <div className="card p-6 mb-4 relative">
        <div className="mb-4">
          <div className="flex items-center mb-2">
            {dragHandleProps && (
              <button
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-move"
                {...(dragHandleProps || {})}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            )}
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mr-3">
              Câu {index + 1}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ID: {question.id}
            </span>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Câu hỏi
            </label>
            <textarea
              value={editedQuestion.question}
              onChange={(e) =>
                setEditedQuestion((prev) => ({
                  ...prev,
                  question: e.target.value,
                }))
              }
              className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
              rows={3}
            />

            {/* Question Image Upload + Paste from clipboard */}
            <div className="mt-3">
              <div className="flex gap-4 items-start">
                {/* Nửa trái: Click, kéo thả... */}
                <div className="flex flex-col w-1/2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ảnh cho câu hỏi (tùy chọn)
                  </label>
                  <ImageUpload
                    onImageUpload={handleQuestionImageUpload}
                    currentImage={editedQuestion.questionImage}
                    placeholder="Thêm ảnh cho câu hỏi"
                    className="w-full"
                    onAssignFromGallery={(id) =>
                      handleAssignImage(id, handleQuestionImageUpload)
                    }
                    onImageRemoved={(img) => setPendingRestores((prev) => [...prev, img])}
                  />
                </div>
                {/* Nửa phải: Paste ảnh */}
                <div className="flex flex-col w-1/2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Paste ảnh
                  </label>
                  <div
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 transition-colors group w-full"
                    tabIndex={0}
                    onClick={async () => {
                      if (navigator.clipboard && window.ClipboardItem) {
                        try {
                          const items = await navigator.clipboard.read();
                          for (const item of items) {
                            for (const type of item.types) {
                              if (type.startsWith("image/")) {
                                const blob = await item.getType(type);
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                  const result = e.target?.result as string;
                                  handleQuestionImageUpload(result);
                                  toast.success("Đã dán ảnh từ clipboard!");
                                };
                                reader.readAsDataURL(blob);
                                return;
                              }
                            }
                          }
                          toast.error("Không tìm thấy ảnh trong clipboard!");
                        } catch (err) {
                          toast.error(
                            "Trình duyệt không hỗ trợ hoặc không có quyền đọc clipboard!"
                          );
                        }
                      } else {
                        toast.error(
                          "Trình duyệt không hỗ trợ dán ảnh từ clipboard!"
                        );
                      }
                    }}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <svg
                        className="w-8 h-8 text-gray-400 group-hover:text-primary-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-primary-600 dark:text-primary-400">
                          Dán ảnh từ clipboard
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Click để dán ảnh đã copy
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Loại câu hỏi
            </label>
            <select
              value={editedQuestion.type}
              onChange={(e) =>
                handleTypeChange(
                  e.target.value as
                  | "single"
                  | "multiple"
                  | "text"
                  | "drag"
                  | "composite"
                )
              }
              className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="single">Chọn 1 đáp án</option>
              <option value="multiple">Chọn nhiều đáp án</option>
              <option value="text">Điền đáp án</option>
              <option value="drag">Kéo thả vào nhóm</option>
              <option value="composite">Câu hỏi mẹ (nhiều câu con)</option>
            </select>
          </div>

          {editedQuestion.type !== "text" &&
            editedQuestion.type !== "drag" &&
            editedQuestion.type !== "composite" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Các đáp án
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = [
                        ...(Array.isArray(editedQuestion.options)
                          ? (editedQuestion.options as string[])
                          : []),
                        "",
                      ];
                      setEditedQuestion((prev) => ({
                        ...prev,
                        options: newOptions,
                      }));
                      savedOptionsRef.current = newOptions;
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    Thêm đáp án
                  </button>
                </div>
                <div className="space-y-4">
                  {(Array.isArray(editedQuestion.options)
                    ? (editedQuestion.options as string[])
                    : []
                  ).map((option: string, index: number) => (
                    <div
                      key={index}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg p-4"
                    >
                      <div className="flex items-center space-x-3 mb-3">
                        <input
                          type={
                            editedQuestion.type === "single"
                              ? "radio"
                              : "checkbox"
                          }
                          name={`correct-${editedQuestion.id}`}
                          checked={(Array.isArray(editedQuestion.correctAnswers)
                            ? (editedQuestion.correctAnswers as string[])
                            : []
                          ).includes(option)}
                          onChange={() => handleCorrectAnswerToggle(option)}
                          disabled={!option.trim()}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <textarea
                          value={option}
                          onChange={(e) =>
                            handleOptionChange(index, e.target.value)
                          }
                          className="flex-1 p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white min-h-[42px]"
                          placeholder={`Đáp án ${String.fromCharCode(
                            65 + index
                          )}`}
                          rows={1}
                          style={{ resize: "vertical" }}
                        />
                        {(editedQuestion.options || []).length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOptions = (
                                Array.isArray(editedQuestion.options)
                                  ? (editedQuestion.options as string[])
                                  : []
                              ).filter((_: any, i: number) => i !== index);
                              const ca = Array.isArray(
                                editedQuestion.correctAnswers
                              )
                                ? (editedQuestion.correctAnswers as string[])
                                : [];
                              const newCorrectAnswers = ca.filter(
                                (ans: string) => newOptions.includes(ans)
                              );
                              // Remove image for deleted option
                              const newOptionImages = {
                                ...editedQuestion.optionImages,
                              };
                              delete newOptionImages[option];
                              setEditedQuestion((prev) => ({
                                ...prev,
                                options: newOptions,
                                correctAnswers: newCorrectAnswers,
                                optionImages: newOptionImages,
                              }));
                              savedOptionsRef.current = newOptions;
                            }}
                            className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* Option Image Upload + Paste from clipboard */}
                      {option.trim() && (
                        <div className="flex gap-4 items-start">
                          {/* Nửa trái: Click, kéo thả... */}
                          <div className="flex flex-col w-1/2">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                              Ảnh cho đáp án {String.fromCharCode(65 + index)}{" "}
                              (tùy chọn)
                            </label>
                            <ImageUpload
                              onImageUpload={(imageData) =>
                                handleOptionImageUpload(option, imageData)
                              }
                              currentImage={
                                editedQuestion.optionImages?.[option]
                              }
                              placeholder="Thêm ảnh cho đáp án"
                              className="w-full"
                              onAssignFromGallery={(id) =>
                                handleAssignImage(id, (data) =>
                                  handleOptionImageUpload(option, data)
                                )
                              }
                              onImageRemoved={handleRestoreToGallery}
                            />
                          </div>
                          {/* Nửa phải: Paste ảnh */}
                          <div className="flex flex-col w-1/2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Paste ảnh
                            </label>
                            <div
                              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-400 transition-colors group w-full"
                              tabIndex={0}
                              onClick={async () => {
                                if (
                                  navigator.clipboard &&
                                  window.ClipboardItem
                                ) {
                                  try {
                                    const items =
                                      await navigator.clipboard.read();
                                    for (const item of items) {
                                      for (const type of item.types) {
                                        if (type.startsWith("image/")) {
                                          const blob = await item.getType(type);
                                          const reader = new FileReader();
                                          reader.onload = (e) => {
                                            const result = e.target
                                              ?.result as string;
                                            handleOptionImageUpload(
                                              option,
                                              result
                                            );
                                            toast.success(
                                              "Đã dán ảnh từ clipboard!"
                                            );
                                          };
                                          reader.readAsDataURL(blob);
                                          return;
                                        }
                                      }
                                    }
                                    toast.error(
                                      "Không tìm thấy ảnh trong clipboard!"
                                    );
                                  } catch (err) {
                                    toast.error(
                                      "Trình duyệt không hỗ trợ hoặc không có quyền đọc clipboard!"
                                    );
                                  }
                                } else {
                                  toast.error(
                                    "Trình duyệt không hỗ trợ dán ảnh từ clipboard!"
                                  );
                                }
                              }}
                            >
                              <div className="flex flex-col items-center space-y-2">
                                <svg
                                  className="w-8 h-8 text-gray-400 group-hover:text-primary-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  <span className="font-medium text-primary-600 dark:text-primary-400">
                                    Dán ảnh từ clipboard
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  Click để dán ảnh đã copy
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Cần ít nhất 2 đáp án cho câu hỏi trắc nghiệm. Nhấn vào
                  checkbox/radio để chọn đáp án đúng.
                </p>
              </div>
            )}

          {editedQuestion.type === "drag" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nhóm đích
                </label>
                {(() => {
                  const dragOpt = (editedQuestion.options as any) || {
                    targets: [],
                    items: [],
                  };
                  const targets = dragOpt.targets as any[];
                  return (
                    <div className="space-y-2">
                      {targets.map((t, i) => (
                        <div
                          key={t.id || i}
                          className="flex items-center gap-2"
                        >
                          <textarea
                            className="flex-1 p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 min-h-[42px]"
                            value={t.label || ""}
                            placeholder={`Nhóm ${i + 1}`}
                            rows={1}
                            style={{ resize: "vertical" }}
                            onChange={(e) => {
                              const next = {
                                ...(editedQuestion.options as any),
                              };
                              next.targets = [...(next.targets || [])];
                              next.targets[i] = {
                                id: t.id || `t${i + 1}`,
                                label: e.target.value,
                              };
                              setEditedQuestion((prev) => ({
                                ...prev,
                                options: next,
                              }));
                            }}
                          />
                          <button
                            className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              const next = {
                                ...(editedQuestion.options as any),
                              };
                              const removedTarget = (next.targets || [])[i]?.id;
                              next.targets = (next.targets || []).filter(
                                (_: any, idx: number) => idx !== i
                              );
                              // Làm sạch mapping: xóa các đáp án đang gán vào target vừa xóa
                              const nextMap = {
                                ...(editedQuestion.correctAnswers as any),
                              } as Record<string, string>;
                              if (removedTarget) {
                                Object.keys(nextMap).forEach((key) => {
                                  if (nextMap[key] === removedTarget) delete nextMap[key];
                                });
                              }
                              setEditedQuestion((prev) => ({
                                ...prev,
                                options: next,
                                correctAnswers: nextMap as any,
                              }));
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      ))}
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const next = { ...(editedQuestion.options as any) };
                          next.targets = [
                            ...(next.targets || []),
                            {
                              id: `t${(next.targets?.length || 0) + 1}`,
                              label: "",
                            },
                          ];
                          setEditedQuestion((prev) => ({
                            ...prev,
                            options: next,
                          }));
                        }}
                      >
                        + Thêm nhóm
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Đáp án kéo thả
                </label>
                {(() => {
                  const dragOpt = (editedQuestion.options as any) || {
                    targets: [],
                    items: [],
                  };
                  const items = dragOpt.items as any[];
                  const targets = (dragOpt.targets as any[]) || [];
                  const mapping = (editedQuestion.correctAnswers as any) || {};
                  return (
                    <div className="space-y-2">
                      {items.map((it, i) => (
                        <div
                          key={it.id || i}
                          className="flex items-center gap-2"
                        >
                          <textarea
                            className="flex-1 p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 min-h-[42px]"
                            value={it.label || ""}
                            placeholder={`Đáp án ${i + 1}`}
                            rows={1}
                            style={{ resize: "vertical" }}
                            onChange={(e) => {
                              const next = {
                                ...(editedQuestion.options as any),
                              };
                              next.items = [...(next.items || [])];
                              next.items[i] = {
                                id: it.id || `i${i + 1}`,
                                label: e.target.value,
                              };
                              setEditedQuestion((prev) => ({
                                ...prev,
                                options: next,
                              }));
                            }}
                          />
                          <select
                            className="p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            value={mapping[it.id] || ""}
                            onChange={(e) => {
                              const nextMap = {
                                ...(editedQuestion.correctAnswers as any),
                              };
                              const selectedValue = e.target.value;
                              if (selectedValue === "") {
                                // Không chọn nhóm nào → xóa khỏi mapping (undefined)
                                delete nextMap[it.id || `i${i + 1}`];
                              } else {
                                nextMap[it.id || `i${i + 1}`] = selectedValue;
                              }
                              setEditedQuestion((prev) => ({
                                ...prev,
                                correctAnswers: nextMap as any,
                              }));
                            }}
                          >
                            <option
                              value=""
                              className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              -- Không thuộc nhóm nào --
                            </option>
                            {targets.map((t) => (
                              <option
                                key={t.id}
                                value={t.id}
                                className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                {t.label || t.id}
                              </option>
                            ))}
                          </select>
                          <button
                            className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => {
                              const next = {
                                ...(editedQuestion.options as any),
                              };
                              next.items = (next.items || []).filter(
                                (_: any, idx: number) => idx !== i
                              );
                              const nextMap = {
                                ...(editedQuestion.correctAnswers as any),
                              };
                              delete nextMap[it.id];
                              setEditedQuestion((prev) => ({
                                ...prev,
                                options: next,
                                correctAnswers: nextMap as any,
                              }));
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      ))}
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const next = { ...(editedQuestion.options as any) };
                          next.items = [
                            ...(next.items || []),
                            {
                              id: `i${(next.items?.length || 0) + 1}`,
                              label: "",
                            },
                          ];
                          setEditedQuestion((prev) => ({
                            ...prev,
                            options: next,
                          }));
                        }}
                      >
                        + Thêm đáp án
                      </button>
                    </div>
                  );
                })()}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Khi xuất bản, học sinh sẽ kéo thả từng đáp án vào nhóm đúng.
              </p>
            </div>
          )}

          {editedQuestion.type === "text" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Đáp án đúng
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditedQuestion((prev) => ({
                      ...prev,
                      correctAnswers: [
                        ...(prev.correctAnswers as string[]),
                        "",
                      ] as any,
                    }));
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Thêm đáp án
                </button>
              </div>
              <div className="space-y-2">
                {(editedQuestion.correctAnswers as string[]).map(
                  (answer: string, index: number) => (
                    <div key={index} className="flex items-center space-x-2">
                      <textarea
                        value={answer}
                        onChange={(e) => {
                          const newAnswers = [
                            ...(editedQuestion.correctAnswers as string[]),
                          ];
                          newAnswers[index] = e.target.value;
                          setEditedQuestion((prev) => ({
                            ...prev,
                            correctAnswers: newAnswers,
                          }));
                        }}
                        className="flex-1 p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white min-h-[50px]"
                        placeholder={`Đáp án đúng ${index + 1}`}
                        rows={1}
                        style={{ resize: "vertical" }}
                      />
                      {Array.isArray(editedQuestion.correctAnswers) &&
                        (editedQuestion.correctAnswers as string[]).length >
                        1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newAnswers = (
                                editedQuestion.correctAnswers as string[]
                              ).filter((_: any, i: number) => i !== index);
                              setEditedQuestion((prev) => ({
                                ...prev,
                                correctAnswers:
                                  newAnswers.length > 0 ? newAnswers : [""],
                              }));
                            }}
                            className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                    </div>
                  )
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Có thể thêm nhiều đáp án đúng. Học sinh chỉ cần nhập một trong
                các đáp án này.
              </p>
            </div>
          )}

          {editedQuestion.type === "composite" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Câu hỏi con
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newSubQuestion: QuestionWithImages = {
                      id: `sq-${Date.now()}-${Math.random()}`,
                      question: "",
                      type: "single",
                      options: ["", ""],
                      correctAnswers: [],
                      explanation: "",
                    };
                    setEditedQuestion((prev) => ({
                      ...prev,
                      subQuestions: [
                        ...(prev.subQuestions || []),
                        newSubQuestion,
                      ],
                    }));
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Thêm câu hỏi con
                </button>
              </div>

              {(editedQuestion.subQuestions || []).length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <p className="text-gray-500 dark:text-gray-400">
                    Chưa có câu hỏi con nào. Nhấn "Thêm câu hỏi con" để bắt đầu.
                  </p>
                </div>
              )}

              {(editedQuestion.subQuestions || []).map((subQ, subIndex) => (
                <div
                  key={subQ.id}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Câu hỏi con {subIndex + 1}
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedQuestion((prev) => ({
                          ...prev,
                          subQuestions: (prev.subQuestions || []).filter(
                            (_, i) => i !== subIndex
                          ),
                        }));
                      }}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Sub-question text */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Nội dung câu hỏi
                    </label>
                    <textarea
                      value={subQ.question}
                      onChange={(e) => {
                        const updated = [
                          ...(editedQuestion.subQuestions || []),
                        ];
                        updated[subIndex] = {
                          ...subQ,
                          question: e.target.value,
                        };
                        setEditedQuestion((prev) => ({
                          ...prev,
                          subQuestions: updated,
                        }));
                      }}
                      className="w-full p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-h-[42px]"
                      placeholder="Nhập câu hỏi con..."
                      rows={2}
                      style={{ resize: "vertical" }}
                    />
                  </div>

                  {/* Sub-question type */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Loại câu hỏi
                    </label>
                    <select
                      value={subQ.type}
                      onChange={(e) => {
                        const newType = e.target.value as
                          | "single"
                          | "multiple"
                          | "text";
                        const updated = [
                          ...(editedQuestion.subQuestions || []),
                        ];
                        if (newType === "text") {
                          updated[subIndex] = {
                            ...subQ,
                            type: newType,
                            options: undefined,
                            correctAnswers: [""],
                          };
                        } else {
                          updated[subIndex] = {
                            ...subQ,
                            type: newType,
                            options: subQ.options || ["", ""],
                            correctAnswers: [],
                          };
                        }
                        setEditedQuestion((prev) => ({
                          ...prev,
                          subQuestions: updated,
                        }));
                      }}
                      className="w-full p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="single">Chọn 1 đáp án</option>
                      <option value="multiple">Chọn nhiều đáp án</option>
                      <option value="text">Điền đáp án</option>
                    </select>
                  </div>

                  {/* Options for single/multiple choice */}
                  {subQ.type !== "text" && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Đáp án
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [
                              ...(editedQuestion.subQuestions || []),
                            ];
                            const currentOpts = Array.isArray(subQ.options)
                              ? (subQ.options as string[])
                              : [];
                            updated[subIndex] = {
                              ...subQ,
                              options: [...currentOpts, ""],
                            };
                            setEditedQuestion((prev) => ({
                              ...prev,
                              subQuestions: updated,
                            }));
                          }}
                          className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        >
                          + Thêm đáp án
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(subQ.options)
                          ? (subQ.options as string[])
                          : []
                        ).map((opt: string, optIdx: number) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type={
                                subQ.type === "single" ? "radio" : "checkbox"
                              }
                              name={`subq-${subQ.id}`}
                              checked={
                                Array.isArray(subQ.correctAnswers)
                                  ? (subQ.correctAnswers as string[]).includes(
                                    opt
                                  )
                                  : false
                              }
                              onChange={() => {
                                const updated = [
                                  ...(editedQuestion.subQuestions || []),
                                ];
                                const currentCorrect = Array.isArray(
                                  subQ.correctAnswers
                                )
                                  ? (subQ.correctAnswers as string[])
                                  : [];
                                if (subQ.type === "single") {
                                  updated[subIndex] = {
                                    ...subQ,
                                    correctAnswers: [opt],
                                  };
                                } else {
                                  const newCorrect = currentCorrect.includes(
                                    opt
                                  )
                                    ? currentCorrect.filter(
                                      (a: string) => a !== opt
                                    )
                                    : [...currentCorrect, opt];
                                  updated[subIndex] = {
                                    ...subQ,
                                    correctAnswers: newCorrect,
                                  };
                                }
                                setEditedQuestion((prev) => ({
                                  ...prev,
                                  subQuestions: updated,
                                }));
                              }}
                              disabled={!opt.trim()}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <textarea
                              value={opt}
                              onChange={(e) => {
                                const updated = [
                                  ...(editedQuestion.subQuestions || []),
                                ];
                                const currentOpts = Array.isArray(subQ.options)
                                  ? (subQ.options as string[])
                                  : [];
                                const newOptions = [...currentOpts];
                                newOptions[optIdx] = e.target.value;
                                updated[subIndex] = {
                                  ...subQ,
                                  options: newOptions,
                                };
                                setEditedQuestion((prev) => ({
                                  ...prev,
                                  subQuestions: updated,
                                }));
                              }}
                              className="flex-1 p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-h-[42px]"
                              placeholder={`Đáp án ${String.fromCharCode(
                                65 + optIdx
                              )}`}
                              rows={1}
                              style={{ resize: "vertical" }}
                            />
                            {(Array.isArray(subQ.options)
                              ? (subQ.options as string[])
                              : []
                            ).length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [
                                      ...(editedQuestion.subQuestions || []),
                                    ];
                                    const currentOpts = Array.isArray(
                                      subQ.options
                                    )
                                      ? (subQ.options as string[])
                                      : [];
                                    const newOptions = currentOpts.filter(
                                      (_: string, i: number) => i !== optIdx
                                    );
                                    const currentCorrect = Array.isArray(
                                      subQ.correctAnswers
                                    )
                                      ? (subQ.correctAnswers as string[])
                                      : [];
                                    const newCorrect = currentCorrect.filter(
                                      (a: string) => newOptions.includes(a)
                                    );
                                    updated[subIndex] = {
                                      ...subQ,
                                      options: newOptions,
                                      correctAnswers: newCorrect,
                                    };
                                    setEditedQuestion((prev) => ({
                                      ...prev,
                                      subQuestions: updated,
                                    }));
                                  }}
                                  className="p-2 text-red-600 hover:text-red-700 dark:text-red-400"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text answer */}
                  {subQ.type === "text" && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Đáp án đúng
                      </label>
                      {(Array.isArray(subQ.correctAnswers)
                        ? (subQ.correctAnswers as string[])
                        : [""]
                      ).map((ans: string, ansIdx: number) => (
                        <div
                          key={ansIdx}
                          className="flex items-center gap-2 mb-2"
                        >
                          <textarea
                            value={ans}
                            onChange={(e) => {
                              const updated = [
                                ...(editedQuestion.subQuestions || []),
                              ];
                              const currentAnswers = Array.isArray(
                                subQ.correctAnswers
                              )
                                ? (subQ.correctAnswers as string[])
                                : [""];
                              const newAnswers = [...currentAnswers];
                              newAnswers[ansIdx] = e.target.value;
                              updated[subIndex] = {
                                ...subQ,
                                correctAnswers: newAnswers,
                              };
                              setEditedQuestion((prev) => ({
                                ...prev,
                                subQuestions: updated,
                              }));
                            }}
                            className="flex-1 p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-h-[42px]"
                            placeholder="Đáp án đúng"
                            rows={1}
                            style={{ resize: "vertical" }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Explanation */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Giải thích (tùy chọn)
                    </label>
                    <textarea
                      value={subQ.explanation || ""}
                      onChange={(e) => {
                        const updated = [
                          ...(editedQuestion.subQuestions || []),
                        ];
                        updated[subIndex] = {
                          ...subQ,
                          explanation: e.target.value,
                        };
                        setEditedQuestion((prev) => ({
                          ...prev,
                          subQuestions: updated,
                        }));
                      }}
                      className="w-full p-2 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      rows={2}
                      placeholder="Giải thích đáp án..."
                    />
                  </div>
                </div>
              ))}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Câu hỏi mẹ chứa nhiều câu hỏi con. Mỗi câu hỏi con có thể là
                trắc nghiệm hoặc tự luận.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Giải thích (tùy chọn)
            </label>
            <textarea
              value={editedQuestion.explanation || ""}
              onChange={(e) =>
                setEditedQuestion((prev) => ({
                  ...prev,
                  explanation: e.target.value,
                }))
              }
              className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
              rows={2}
              placeholder="Giải thích đáp án..."
            />
          </div>

          <div className="flex space-x-3">
            <button onClick={handleSave} className="btn-primary">
              Lưu
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              Hủy
            </button>
          </div>
        </div>
      </div>
    );
  };

  const QuestionDisplay: React.FC<{
    question: QuestionWithImages;
    index: number;
    dragHandleProps?: any;
  }> = ({ question, index, dragHandleProps }) => {
    return (
      <div className="card p-6 mb-4 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center mb-2">
              {dragHandleProps && (
                <div
                  {...dragHandleProps}
                  className="cursor-grab active:cursor-grabbing p-1 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Kéo để sắp xếp"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </div>
              )}
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mr-3">
                Câu {index + 1}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ID: {question.id}
              </span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              <MathText text={question.question} />
            </h3>

            {/* Question Image Display */}
            {question.questionImage && (
              <div className="mb-4">
                <img
                  src={question.questionImage}
                  alt="Question"
                  className="max-w-md max-h-64 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600"
                />
              </div>
            )}

            <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                {question.type === "single"
                  ? "Chọn 1"
                  : question.type === "multiple"
                    ? "Chọn nhiều"
                    : question.type === "drag"
                      ? "Kéo thả"
                      : question.type === "composite"
                        ? "Câu hỏi mẹ"
                        : "Điền đáp án"}
              </span>

              {(question.questionImage ||
                (question.optionImages &&
                  Object.keys(question.optionImages).length > 0)) && (
                  <span className="flex items-center">
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    Có ảnh
                  </span>
                )}
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleQuestionEdit(question.id)}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={() => handleQuestionDelete(question.id)}
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {question.type !== "text" &&
          question.type !== "composite" &&
          question.options && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {question.type === "single"
                  ? "Chọn 1 đáp án đúng"
                  : "Chọn nhiều đáp án đúng"}
              </div>
              {Array.isArray(question.options) &&
                question.options.map((option: string, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${(Array.isArray(question.correctAnswers)
                      ? (question.correctAnswers as string[])
                      : []
                    ).includes(option)
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-gray-200 dark:border-gray-600"
                      }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        {(Array.isArray(question.correctAnswers)
                          ? (question.correctAnswers as string[])
                          : []
                        ).includes(option) && (
                            <span className="ml-2 text-green-600 dark:text-green-400">
                              ✓
                            </span>
                          )}
                      </div>
                      <div className="flex-1">
                        <span className="text-gray-900 dark:text-gray-100">
                          <MathText text={option} />
                        </span>
                        {/* Option Image Display */}
                        {question.optionImages?.[option] && (
                          <div className="mt-2">
                            <img
                              src={question.optionImages[option]}
                              alt={`Option ${String.fromCharCode(65 + index)}`}
                              className="max-w-xs max-h-32 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

        {question.type === "composite" && question.subQuestions && (
          <div className="space-y-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Câu hỏi con ({question.subQuestions.length} câu):
            </div>
            {question.subQuestions.map((subQ, subIdx) => (
              <div
                key={subQ.id}
                className="pl-4 border-l-4 border-primary-500 dark:border-primary-400"
              >
                <div className="mb-2">
                  <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                    Câu {subIdx + 1}:
                  </span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    <MathText text={subQ.question} />
                  </span>
                </div>

                {subQ.type !== "text" && Array.isArray(subQ.options) && (
                  <div className="space-y-2 ml-6">
                    {(subQ.options as string[]).map(
                      (opt: string, optIdx: number) => (
                        <div
                          key={optIdx}
                          className={`p-2 rounded-lg border text-sm ${Array.isArray(subQ.correctAnswers) &&
                            (subQ.correctAnswers as string[]).includes(opt)
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : "border-gray-200 dark:border-gray-600"
                            }`}
                        >
                          <span className="font-medium text-gray-600 dark:text-gray-300">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          {Array.isArray(subQ.correctAnswers) &&
                            (subQ.correctAnswers as string[]).includes(opt) && (
                              <span className="ml-2 text-green-600 dark:text-green-400">
                                ✓
                              </span>
                            )}
                          <span className="ml-2 text-gray-900 dark:text-gray-100">
                            <MathText text={opt} />
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                {subQ.type === "text" && (
                  <div className="ml-6 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">
                    <span className="text-gray-600 dark:text-gray-300">
                      Đáp án đúng:{" "}
                    </span>
                    {Array.isArray(subQ.correctAnswers) &&
                      (subQ.correctAnswers as string[]).filter((ans: string) =>
                        ans?.trim()
                      ).length > 0 ? (
                      <span className="text-green-800 dark:text-green-300 font-medium">
                        {(subQ.correctAnswers as string[])
                          .filter((ans: string) => ans?.trim())
                          .map((ans, i) => <MathText key={i} text={ans} className="inline-block mr-1" />)}
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        Chưa có đáp án
                      </span>
                    )}
                  </div>
                )}

                {subQ.explanation && (
                  <div className="ml-6 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Giải thích:{" "}
                    </span>
                    <span className="text-blue-700 dark:text-blue-300">
                      <MathText text={subQ.explanation} />
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {question.type === "text" && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="mb-2">
              <span className="text-gray-600 dark:text-gray-300">
                Đáp án đúng:{" "}
              </span>
              {(
                Array.isArray(question.correctAnswers)
                  ? (question.correctAnswers as string[]).filter(
                    (ans: string) => ans?.trim()
                  ).length > 0
                  : false
              ) ? (
                <div className="mt-1">
                  {(question.correctAnswers as string[])
                    .filter((ans: string) => ans?.trim())
                    .map((answer: string, index: number) => (
                      <span
                        key={index}
                        className="inline-block bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 px-2 py-1 rounded text-sm mr-2 mb-1"
                      >
                        "{answer.trim()}"
                      </span>
                    ))}
                </div>
              ) : (
                <span className="font-medium text-red-600 dark:text-red-400">
                  Chưa có đáp án - Vui lòng chỉnh sửa để thêm đáp án
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Học sinh chỉ cần nhập một trong các đáp án trên
            </p>
          </div>
        )}

        {question.explanation && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Giải thích:{" "}
            </span>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              <MathText text={question.explanation} />
            </span>
          </div>
        )}
      </div>
    );
  };

  if (!state) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Không có dữ liệu để chỉnh sửa
          </h1>
          <button onClick={() => navigate("/create")} className="btn-primary">
            Quay lại trang tạo lớp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex-1 min-w-0">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Chỉnh sửa Quiz
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Kiểm tra và chỉnh sửa các câu hỏi từ file {state.fileName}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="btn-primary flex items-center"
              >
                {isPublishing ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Đang xuất bản...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Xuất bản Quiz
                  </>
                )}
              </button>
              <button
                onClick={handleCancel}
                className="btn-secondary flex items-center !bg-gray-100 !text-gray-600 hover:!bg-gray-200 dark:!bg-gray-700 dark:!text-gray-300 dark:hover:!bg-gray-600"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Hủy
              </button>
            </div>
          </div>

          {/* Quiz Info */}
          <div className="card p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  Tiêu đề Quiz
                </label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Nhập tiêu đề Quiz"
                />
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  Mô tả (tùy chọn)
                </label>
                <input
                  type="text"
                  value={quizDescription}
                  onChange={(e) => setQuizDescription(e.target.value)}
                  className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Nhập mô tả Quiz"
                />
              </div>
            </div>
          </div>

          {/* Layout: Kho ảnh - Editor - Preview */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Cột trái - Kho ảnh (chiều rộng cố định) */}
            {unassignedImages.length > 0 && (
              <div className="w-full lg:w-64 flex-shrink-0">
                <div className="lg:sticky lg:top-24">
                  <UnassignedImagesGallery
                    images={unassignedImages}
                    onImageRemove={(imageId) => handleImageDeleted(imageId)}
                    className="card !p-0 shadow-xl max-h-96 lg:max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden custom-thin-scrollbar"
                  />
                </div>
              </div>
            )}

            {/* Phần còn lại: Grid 2 cột cho Editor và Preview */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cột Editor - 2/3 */}
                <div className="lg:col-span-2">
                  <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Chỉnh sửa câu hỏi ({questions.length})
                      </h2>
                      <div className="flex items-center gap-3">
                        {questions.length > 1 && (
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <svg
                              className="w-4 h-4 mr-1"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6h16M4 12h16M4 18h16"
                              />
                            </svg>
                            Kéo thả để sắp xếp
                          </div>
                        )}
                        <button
                          onClick={handleAddQuestion}
                          className="btn-secondary flex items-center"
                        >
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            />
                          </svg>
                          Thêm câu hỏi
                        </button>
                      </div>
                    </div>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={questions.map((q) => q.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-6">
                          {questions.map((question, index) => (
                            <SortableQuestionItem
                              key={question.id}
                              question={question}
                              index={index}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {questions.length === 0 && (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                          Chưa có câu hỏi nào
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                          Thêm câu hỏi đầu tiên để bắt đầu tạo Quiz
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cột phải - Preview */}
                <div className="lg:col-span-1">
                  <div className="sticky top-24">
                    <QuizPreview
                      questions={questions}
                      quizTitle={quizTitle}
                      onEdit={handlePreviewEdit}
                      isEditable={true}
                      onPastedImages={handlePastedImages}
                      content={previewContent}
                      onUndo={undo}
                      onRedo={redo}
                    />
                  </div>
                </div>
              </div>

              {/* Nút xuất bản ở cuối trang */}
              {questions.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-center items-center gap-4">
                    <button
                      onClick={handleAddQuestion}
                      className="btn-secondary flex items-center"
                    >
                      <svg
                        className="w-5 h-5 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      </svg>
                      Thêm câu hỏi
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="btn-primary flex items-center"
                    >
                      {isPublishing ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Đang xuất bản...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          Xuất bản Quiz
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="btn-secondary flex items-center !bg-gray-100 !text-gray-600 hover:!bg-gray-200 dark:!bg-gray-700 dark:!text-gray-300 dark:hover:!bg-gray-600"
                    >
                      <svg
                        className="w-5 h-5 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Floating scroll buttons */}
            {
              canScroll && (
                <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
                  {!atTop && !atBottom && (
                    <button
                      onClick={scrollToTop}
                      className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </button>
                  )}
                  {atTop && (
                    <button
                      onClick={scrollToBottom}
                      className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  )}
                  {atBottom && (
                    <button
                      onClick={scrollToTop}
                      className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditQuizPage;
