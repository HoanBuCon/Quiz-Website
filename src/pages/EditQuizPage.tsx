import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Question, Quiz } from "../types";
import { ParsedQuestion, questionsToStandardText } from "../utils/docsParser";
import { toast } from "react-hot-toast";
import QuizPreview from "../components/QuizPreview";
import MathText from "../components/MathText";
import UnassignedImagesGallery from "../components/UnassignedImagesGallery";
import ImageModal from "../components/ImageModal";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { ImagesAPI } from "../utils/api";
import AIGeneratorModal from "../components/AIGeneratorModal";
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
  pastedImagesMap?: Record<string, string>; // Restore image map
  aiTextContent?: string; // Pre-filled text from AI Theory mode
}

// Extended Question interface to support images
interface QuestionWithImages extends Question {
  questionImage?: string; // Base64 encoded image for question
  questionImageId?: string; // ID of the image
  optionImages?: { [key: string]: string }; // Map of option text to base64 image
  optionImageIds?: { [key: string]: string }; // Map of option text to image ID
}

// Image upload component
const ImageUpload: React.FC<{
  onImageUpload: (imageData: string) => void;
  currentImage?: string;
  placeholder?: string;
  className?: string;
  onAssignFromGallery?: (imageId: string, source?: any) => void;
  onImageRemoved?: (imageData: string, imageId?: string, sourceInfo?: any) => void;
  currentImageId?: string;
  sourceInfo?: {
    sourceType: 'question' | 'option';
    questionId: string;
    optionText?: string;
  };
  onImageClick?: (imageUrl: string) => void;
  // NEW: Callback to notify parent when drag starts/ends for page-level drop handling
  onDragStateChange?: (isDragging: boolean, dragData?: any) => void;
}> = ({
  onImageUpload,
  currentImage,
  currentImageId,
  placeholder = "Thêm ảnh",
  className = "",
  onAssignFromGallery,
  onImageRemoved,
  sourceInfo,
  onImageClick,
  onDragStateChange,
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
        // console.error("Upload error:", error);
        toast.error("Lỗi khi upload ảnh: " + (error as Error).message);
      }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation(); // Stop bubbling to page handler

      // 1. Check for assigned image (move operation from another question/answer)
      const assignedSource = event.dataTransfer.getData('image/assigned-source');
      if (assignedSource) {
        try {
          const source = JSON.parse(assignedSource);
          if (onAssignFromGallery) {
            // First, remove from source location
            // We need access to handleRemoveImageFromSource from parent
            // Since we can't access it directly, we'll pass the source info through callback
            // and let the parent handle the removal
            onAssignFromGallery(source.imageId || source.imageData, source);
            return;
          }
        } catch (e) {
          // console.error('Failed to parse assigned source:', e);
        }
      }

      // 2. Check if dropping from UnassignedImagesGallery (ID based)
      const unassignedId = event.dataTransfer.getData('image/unassigned-id');
      if (unassignedId) {
        if (onAssignFromGallery) {
          onAssignFromGallery(unassignedId);
        }
        return;
      }

      // 3. Otherwise handle as file drop
      const file = event.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation(); // Important: Stop event from bubbling to parent handlers

      // Determine if we are dragging a valid image source (internal or external)
      const hasAssignedSource = event.dataTransfer.types.includes('image/assigned-source');
      const hasUnassignedId = event.dataTransfer.types.includes('image/unassigned-id');

      if (hasAssignedSource || hasUnassignedId) {
        event.dataTransfer.dropEffect = 'move';
      } else {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              try {
                // Check if this is an SVG wrapper (common when pasting from Word)
                console.log('🔍 Blob type:', blob.type);
                if (blob.type === 'image/svg+xml') {
                  console.log('✅ Detected SVG wrapper');
                  // Read the SVG content to extract the actual image
                  const text = await blob.text();

                  // Look for embedded base64 image in SVG
                  const base64Match = text.match(/xlink:href="data:image\/(jpeg|jpg|png|gif);base64,([^"]+)"/i);

                  if (base64Match) {
                    // Extract the actual image type and base64 data
                    const imageType = base64Match[1].toLowerCase();
                    const base64Data = base64Match[2];
                    const mimeType = `image/${imageType === 'jpg' ? 'jpeg' : imageType}`;
                    console.log('✨ Extracted:', imageType, 'size:', base64Data.length);

                    // Convert base64 to blob
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let j = 0; j < byteCharacters.length; j++) {
                      byteNumbers[j] = byteCharacters.charCodeAt(j);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const imageBlob = new Blob([byteArray], { type: mimeType });

                    // Create File from extracted image
                    const timestamp = Date.now();
                    const extension = imageType === 'jpg' ? 'jpeg' : imageType;
                    const filename = `clipboard-${timestamp}.${extension}`;
                    const file = new File([imageBlob], filename, { type: mimeType });

                    handleFile(file);
                    break;
                  }
                }

                // Not SVG or no embedded image found - treat as regular image
                const mimeType = blob.type || 'image/png';
                const extension = mimeType.split('/')[1] || 'png';
                const timestamp = Date.now();
                const filename = `clipboard-${timestamp}.${extension}`;

                // Create a new File object from the blob with proper metadata
                const file = new File([blob], filename, { type: mimeType });

                handleFile(file);
              } catch (error) {
                console.error('Error processing pasted image:', error);
                toast.error('Lỗi khi xử lý ảnh paste');
              }
            }
            break;
          }
        }
      }
    };

    const removeImage = () => {
      const imgToRestore = currentImage;
      const idToRestore = currentImageId;

      if (imgToRestore && onImageRemoved) {
        // Gọi trực tiếp để tránh thêm nhiều history entries
        onImageRemoved(imgToRestore, idToRestore, sourceInfo);
      } else {
        // Nếu không có callback restore, chỉ clear local view
        onImageUpload("");
      }
    };

    const handleImageDragStart = (e: React.DragEvent<HTMLImageElement>) => {
      if (!sourceInfo || !currentImage) return;

      // Store source information for drag-and-drop
      const dragData = {
        imageData: currentImage,
        imageId: currentImageId,
        sourceType: sourceInfo.sourceType,
        questionId: sourceInfo.questionId,
        optionText: sourceInfo.optionText,
      };

      e.dataTransfer.setData('image/assigned-source', JSON.stringify(dragData));
      // Allow both copy and move to be flexible with drop targets
      e.dataTransfer.effectAllowed = 'copyMove';

      // NEW: Notify parent for page-level drop handling
      onDragStateChange?.(true, dragData);
    };

    const handleImageDragEnd = (e: React.DragEvent<HTMLImageElement>) => {
      // NEW: Notify parent that drag ended
      onDragStateChange?.(false);

      // Debug: Checking dropEffect
      // toast.info(`Drop effect: ${e.dataTransfer.dropEffect}`); // Keep commented for production, assume user will uncomment for test if asked.

      // Let's try to just trust it for now, BUT if it fails, maybe we fallback to 'copy' if we detect it?
      // Actually, let's just make sure we catch 'copy' too if the browser forces it.
      if (e.dataTransfer.dropEffect === 'move' || e.dataTransfer.dropEffect === 'copy') {
        removeImage();
      }
    };

    return (
      <div className={className}>
        {currentImage ? (
          <div
            className="relative group"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <img
              src={currentImage}
              alt="Uploaded"
              draggable={!!sourceInfo}
              onMouseDown={(e) => {
                // FIX: Store initial mouse position to detect drag vs click
                (e.target as any).dataset.mouseDownX = e.clientX;
                (e.target as any).dataset.mouseDownY = e.clientY;
                (e.target as any).dataset.isDragging = 'false';
              }}
              onDragStart={(e) => {
                (e.target as any).dataset.isDragging = 'true';
                handleImageDragStart(e);
              }}
              onDragEnd={handleImageDragEnd}
              onClick={(e) => {
                // Only trigger click if not dragging
                const isDragging = (e.target as any).dataset.isDragging === 'true';
                if (!isDragging && onImageClick) {
                  onImageClick(currentImage);
                }
                (e.target as any).dataset.isDragging = 'false';
              }}
              className="max-w-full max-h-48 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity"
              style={{ cursor: sourceInfo ? 'grab' : 'pointer' }}
              title="Click để xem ảnh | Kéo để di chuyển | Kéo ảnh khác vào để thay thế"
              tabIndex={0}
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

  // Image Modal State
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState("");

  // AI Generator Modal
  const [isAIGeneratorOpen, setAIGeneratorOpen] = useState(false);
  const handleAIGenerated = (newQuestions: any[], textContent?: string | null) => {
    if (textContent) {
      // Theory mode: AI returned raw standard text format — set editor content directly
      setEditorState(editor => ({ ...editor, content: textContent }));
      setQuestions([]); // Let the editor re-parse the new content on next parse
      return;
    }

    // Extract mode: JSON questions array → map to text format
    const mappedQuestions = newQuestions.map(q => ({
      ...q,
      id: "q_ai_" + Date.now() + Math.random().toString(36).substr(2, 9),
      isNew: true
    }));
    
    setQuestions(() => {
      const updated = [...mappedQuestions]; // Overwrite existing questions
      
      // Auto-save to editorState by REPLACING content
      try {
        const newTextContent = questionsToStandardText(mappedQuestions);
        
        setEditorState(editor => ({ 
           ...editor, 
           content: newTextContent 
        }));
      } catch (e) {
        console.error("AI questions apply logic format error", e);
      }
      return updated;
    });
  };

  // Image Modal Handlers
  const handleImageClick = (imageUrl: string) => {
    setImageModalUrl(imageUrl);
    setImageModalOpen(true);
  };

  const handleImageModalClose = () => {
    setImageModalOpen(false);
    setImageModalUrl("");
  };

  // Undo/Redo State Manager
  const {
    state: editorState,
    set: setEditorState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo({
    content: state?.aiTextContent || "",
    unassignedImages: state?.unassignedImages || [],
    pastedImagesMap: {} as Record<string, string>,
  });

  // Lưu trữ edited state của từng câu hỏi để tránh mất dữ liệu khi scroll/remount
  // eslint-disable-next-line
  const editedQuestionsMapRef = useRef<Map<string, QuestionWithImages>>(new Map());
  const handleQuestionSaveRef = useRef<((id: string, q: any, options?: { exitEditMode?: boolean }) => void) | null>(null);
  // Lưu lại thông tin vị trí phần tử để giữ nguyên viewport sau các thao tác chỉnh sửa
  const scrollAnchorRef = useRef<{
    id: string;
    offsetTop: number;
    ts: number;
  } | null>(null);
  // Refs for auto-scroll preview when editor cursor changes
  const questionCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Flag to prevent infinite loop when syncing questions from content
  const isUpdatingFromQuestionsRef = useRef(false);
  // Flag to prevent re-parse when updating pastedImagesMap from external file drop
  const isUpdatingPastedImagesRef = useRef(false);
  // Flag để tắt auto-save khi người dùng hủy hoặc kết thúc chỉnh sửa
  const autoSaveDisabledRef = useRef(false);

  // Track dragged image for drop-anywhere feature
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const draggedImageRef = useRef<any>(null);

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
    // ATOMIC UPDATE: Remove image from content, map, unassigned, and update questions in one go
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

      // Parse and update questions immediately
      const parsed = parseEditedContent(newContent);
      setQuestions(parsed);

      return {
        ...prev,
        content: newContent,
        pastedImagesMap: newMap,
        unassignedImages: newUnassigned,
      };
    });
  };

  const handleAssignImage = (imageId: string, callback: (data: string) => void) => {
    const img = unassignedImages.find((i) => i.id === imageId);
    if (img) {
      callback(img.data);
      // FIX: Immediately remove from gallery after assignment
      // This ensures that even on the first drop, the image is removed from the unassigned gallery
      handleImageAssigned(imageId);
      // NOTE: Toast removed to avoid duplicate with saveDroppedImage's "Đã cập nhật ảnh!"
    } else {
      toast.error("Không tìm thấy dữ liệu ảnh!");
    }
  };

  const handleRestoreToGallery = (imageData: string, imageId?: string, sourceInfo?: any) => {
    // NEW: Auto-save if dragging from currently edited question
    if (sourceInfo && isEditing && sourceInfo.questionId === isEditing) {
      if (handleQuestionSaveRef.current) {
        const currentQ = editedQuestionsMapRef.current.get(sourceInfo.questionId);
        if (currentQ) {
          const updatedQ = { ...currentQ };

          // Remove image logic
          if (sourceInfo.sourceType === 'question') {
            updatedQ.questionImage = undefined;
            updatedQ.questionImageId = undefined;
          } else if (sourceInfo.sourceType === 'option' && sourceInfo.optionText) {
            if (updatedQ.optionImages) {
              const newOptionImages = { ...updatedQ.optionImages };
              delete newOptionImages[sourceInfo.optionText];
              updatedQ.optionImages = newOptionImages;
            }
            if (updatedQ.optionImageIds) {
              const newOptionIds = { ...updatedQ.optionImageIds };
              delete newOptionIds[sourceInfo.optionText];
              updatedQ.optionImageIds = newOptionIds;
            }
          }

          handleQuestionSaveRef.current(sourceInfo.questionId, updatedQ, { exitEditMode: false });
          // Toast handled by handleQuestionSave or we can add one
          toast.success("Đã lưu và đưa ảnh về kho!");
          return;
        }
      }
    }

    if (!imageData) return;

    // Use existing ID if available
    let idToUse = imageId;

    // If no ID provided, try to find existing or generate new
    if (!idToUse) {
      // First check if this exact data already exists in the map
      idToUse = findImageIdByData(imageData, editorState.pastedImagesMap);
      // If still not found, generate new ID
      if (!idToUse) {
        idToUse = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }
    }

    // ATOMIC UPDATE: Update questions and editorState together in one history entry
    if (sourceInfo && sourceInfo.questionId) {
      setQuestions(prevQuestions => {
        const updatedQuestions = prevQuestions.map(q => {
          if (q.id === sourceInfo.questionId) {
            const newQ = { ...q };

            // Sync with Edit Map if exists (for QuestionEditor)
            const cachedEditState = editedQuestionsMapRef.current.get(q.id);
            let cachedUpdated = cachedEditState ? { ...cachedEditState } : null;

            // Case 1: Question Image
            if (sourceInfo.sourceType === 'question') {
              newQ.questionImage = undefined;
              newQ.questionImageId = undefined;

              if (cachedUpdated) {
                cachedUpdated.questionImage = undefined;
                cachedUpdated.questionImageId = undefined;
              }
            }
            // Case 2: Option Image
            else if (sourceInfo.sourceType === 'option' && sourceInfo.optionText) {
              if (newQ.optionImages) {
                const newOptionImages = { ...newQ.optionImages };
                delete newOptionImages[sourceInfo.optionText];
                newQ.optionImages = newOptionImages;
              }
              if (newQ.optionImageIds) {
                const newOptionImageIds = { ...newQ.optionImageIds };
                delete newOptionImageIds[sourceInfo.optionText];
                newQ.optionImageIds = newOptionImageIds;
              }

              if (cachedUpdated) {
                if (cachedUpdated.optionImages) {
                  const cachedOptionImages = { ...cachedUpdated.optionImages };
                  delete cachedOptionImages[sourceInfo.optionText];
                  cachedUpdated.optionImages = cachedOptionImages;
                }
                if (cachedUpdated.optionImageIds) {
                  const cachedOptionImageIds = { ...cachedUpdated.optionImageIds };
                  delete cachedOptionImageIds[sourceInfo.optionText];
                  cachedUpdated.optionImageIds = cachedOptionImageIds;
                }
              }
            }

            // Update Map
            if (cachedUpdated) {
              editedQuestionsMapRef.current.set(q.id, cachedUpdated);
            }
            return newQ;
          }
          return q;
        });

        // Set flag to prevent infinite loop in useEffect
        isUpdatingFromQuestionsRef.current = true;

        // ATOMIC UPDATE: Update editorState with content, gallery, and unassigned images in one go
        setEditorState((prev) => {
          // A. Add to Gallery Logic
          const existsInUnassigned = prev.unassignedImages.some((img) => img.id === idToUse);
          const existsInMap = idToUse! in prev.pastedImagesMap;

          const newMap = { ...prev.pastedImagesMap };
          if (!existsInMap) {
            newMap[idToUse!] = imageData;
          }

          // Generate new content from updated questions with updated map
          const newPreviewContent = generatePreviewContent(updatedQuestions, newMap);

          // B. Recalculate unassigned images based on new content
          const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
          const usedIds = new Set<string>();
          let match;
          while ((match = imageTagRegex.exec(newPreviewContent)) !== null) {
            usedIds.add(match[1]);
          }

          const recalculatedUnassigned: import('../types').ExtractedImage[] = [];
          Object.entries(newMap).forEach(([id, data]) => {
            if (!usedIds.has(id)) {
              recalculatedUnassigned.push({ id, data });
            }
          });

          return {
            ...prev,
            content: newPreviewContent,
            pastedImagesMap: newMap,
            unassignedImages: recalculatedUnassigned
          };
        });

        return updatedQuestions;
      });
    } else {
      // No source question, just add to gallery and update content if needed
      setEditorState((prev) => {
        const existsInUnassigned = prev.unassignedImages.some((img) => img.id === idToUse);
        const existsInMap = idToUse! in prev.pastedImagesMap;

        const newMap = { ...prev.pastedImagesMap };
        if (!existsInMap) {
          newMap[idToUse!] = imageData;
        }

        let newUnassigned = prev.unassignedImages;
        if (!existsInUnassigned) {
          newUnassigned = [...prev.unassignedImages, { id: idToUse!, data: imageData }];
        }

        return {
          ...prev,
          pastedImagesMap: newMap,
          unassignedImages: newUnassigned
        };
      });
    }

    // Immediate feedback is handled by state update above
    toast.success("Ảnh đã được đưa về kho!");
  };

  // Handler for dragging images from questions/answers back to gallery
  const handleImageRestoreFromDrag = (source: {
    imageData: string;
    imageId?: string;
    sourceType: 'question' | 'option';
    questionId: string;
    optionText?: string;
  }) => {
    // Just delegate to the atomic handler
    handleRestoreToGallery(source.imageData, source.imageId, source);
  };

  // Helper function to remove image from its source location when moving between questions/answers
  const handleRemoveImageFromSource = (source: {
    imageData: string;
    imageId?: string;
    sourceType: 'question' | 'option';
    questionId: string;
    optionText?: string;
  }) => {
    // console.log('handleRemoveImageFromSource called with:', source);

    // ATOMIC UPDATE: Remove image from questions and update content together
    setQuestions(prev => {
      // console.log('Current questions count:', prev.length);
      const foundQuestion = prev.find(q => q.id === source.questionId);
      // console.log('Found question:', foundQuestion?.id, foundQuestion?.questionImage ? 'has image' : 'no image');

      const updated = prev.map(q => {
        if (q.id !== source.questionId) return q;

        const updatedQ = { ...q };

        // SYNC FIX: Also update the cached edit state if it exists
        // This ensures that if the user opens Edit Mode later, they see the image removed
        const cachedEditState = editedQuestionsMapRef.current.get(q.id);
        let cachedUpdated = cachedEditState ? { ...cachedEditState } : null;

        if (source.sourceType === 'question') {
          // Remove question image
          // console.log('Removing question image from question:', q.id);
          updatedQ.questionImage = undefined;
          updatedQ.questionImageId = undefined;

          if (cachedUpdated) {
            cachedUpdated.questionImage = undefined;
            cachedUpdated.questionImageId = undefined;
          }
        } else if (source.sourceType === 'option' && source.optionText) {
          // Remove option image
          // console.log('Removing option image:', source.optionText, 'from question:', q.id);
          const newOptionImages = { ...updatedQ.optionImages };
          const newOptionImageIds = { ...updatedQ.optionImageIds };
          delete newOptionImages[source.optionText];
          delete newOptionImageIds[source.optionText];
          updatedQ.optionImages = newOptionImages;
          updatedQ.optionImageIds = newOptionImageIds;

          if (cachedUpdated) {
            const cachedOptionImages = { ...cachedUpdated.optionImages };
            const cachedOptionImageIds = { ...cachedUpdated.optionImageIds };
            delete cachedOptionImages[source.optionText];
            delete cachedOptionImageIds[source.optionText];
            cachedUpdated.optionImages = cachedOptionImages;
            cachedUpdated.optionImageIds = cachedOptionImageIds;
          }
        }

        if (cachedUpdated) {
          editedQuestionsMapRef.current.set(q.id, cachedUpdated);
        }

        // console.log('Updated question:', updatedQ.id, updatedQ.questionImage ? 'still has image' : 'image removed');
        return updatedQ;
      });

      // Set flag to prevent infinite loop in useEffect
      isUpdatingFromQuestionsRef.current = true;

      // ATOMIC UPDATE: Update editorState content and recalculate unassigned images
      setEditorState(prev => {
        // Generate new content from updated questions with current map
        const newContent = generatePreviewContent(updated, prev.pastedImagesMap);

        const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
        const usedIds = new Set<string>();
        let match;
        while ((match = imageTagRegex.exec(newContent)) !== null) {
          usedIds.add(match[1]);
        }

        const newUnassigned: import('../types').ExtractedImage[] = [];
        Object.entries(prev.pastedImagesMap).forEach(([id, data]) => {
          if (!usedIds.has(id)) {
            newUnassigned.push({ id, data });
          }
        });

        return {
          ...prev,
          content: newContent,
          unassignedImages: newUnassigned
        };
      });

      return updated;
    });
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
      const allImages = { ...prev.pastedImagesMap, ...newImages };
      const content = prev.content;

      // Recalculate Unassigned Images ROBUSTLY
      // 1. Identify all "Used Data" from content
      const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
      const imageIdsInContent = new Set<string>();
      let match;
      while ((match = imageTagRegex.exec(content)) !== null) {
        imageIdsInContent.add(match[1]);
      }

      const usedData = new Set<string>();
      imageIdsInContent.forEach(id => {
        if (allImages[id]) {
          usedData.add(allImages[id]);
        }
      });

      // 2. Filter unassigned images
      const uniqueUnassignedData = new Set<string>();
      const newUnassigned: import('../types').ExtractedImage[] = [];

      Object.entries(allImages).forEach(([id, data]) => {
        // If this data is already used in content, skip it entirely
        if (usedData.has(data)) return;

        // If we haven't added this data to our unassigned list yet, add it
        if (!uniqueUnassignedData.has(data)) {
          uniqueUnassignedData.add(data);
          newUnassigned.push({ id, data });
        }
      });

      return {
        ...prev,
        pastedImagesMap: allImages,
        unassignedImages: newUnassigned
      };
    });
    toast.success(`Đã nhận diện ${Object.keys(newImages).length} ảnh từ bộ nhớ tạm`);
  };

  // Hàm xử lý khi nội dung preview được chỉnh sửa
  const handlePreviewEdit = (content: string) => {
    // 1. Parse nội dung và cập nhật questions
    // Note: setQuestions sets local state, does not affect Undo History (managed by useUndoRedo)
    const parsedQuestions = parseEditedContent(content);
    setQuestions(parsedQuestions);

    // 2. Identify all [IMAGE:id] tags currently in content
    const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
    const imageIdsInContent = new Set<string>();
    let match;
    while ((match = imageTagRegex.exec(content)) !== null) {
      imageIdsInContent.add(match[1]);
    }

    // 3. ATOMIC STATE UPDATE: Update Content AND Unassigned Images together
    setEditorState(prev => {
      // FIX: Merge unassigned images into the map to ensure we don't lose them.
      // Images loaded from file are in 'unassignedImages' but might not be in 'pastedImagesMap' yet.
      const initialMap: Record<string, string> = {};
      prev.unassignedImages.forEach(img => {
        initialMap[img.id] = img.data;
      });

      // Combine maps: Pasted/History map overwrites initial if collision (shouldn't happen with unique IDs)
      const allImages = { ...initialMap, ...prev.pastedImagesMap };

      // log debug to investigate why images aren't returning
      // console.log("DEBUG: handlePreviewEdit Check", {
      //   totalImagesInMap: Object.keys(allImages).length,
      //   idsInContent: Array.from(imageIdsInContent),
      //   sampleMapKeys: Object.keys(allImages).slice(0, 5)
      // });

      // 1. Identify all "Used IDs"
      // Since we now enforce Unique IDs for every image instance, we just check ID presence.
      const usedIds = imageIdsInContent;

      // 2. Filter unassigned images (ID-based)
      const newUnassigned: import('../types').ExtractedImage[] = [];

      Object.entries(allImages).forEach(([id, data]) => {
        // If this ID is present in the text, it is "Assigned".
        if (usedIds.has(id)) return;

        // If not in text, it's Unassigned.
        newUnassigned.push({ id, data });
      });

      // console.log("DEBUG: Auto-Restore Result (ID-Based)", {
      //   usedIdsCount: usedIds.size,
      //   newUnassignedCount: newUnassigned.length
      // });

      return {
        ...prev,
        content: content,
        pastedImagesMap: allImages, // UPDATE MAP: Important to persist initial images into the map for future restores
        unassignedImages: newUnassigned
      };
    });

    // Auto-save logic handles the rest
  };

  // Helper to recalculate unassigned images from content (to be used by GUI save)
  const syncUnassignedFromContent = (content: string) => {
    setEditorState(prev => {
      const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
      const usedIds = new Set<string>();
      let match;
      while ((match = imageTagRegex.exec(content)) !== null) {
        usedIds.add(match[1]);
      }

      // FIX Same here: Ensure we consider unassigned images in the pool
      const initialMap: Record<string, string> = {};
      prev.unassignedImages.forEach(img => {
        initialMap[img.id] = img.data;
      });

      const allImages = { ...initialMap, ...prev.pastedImagesMap };
      const newUnassigned: import('../types').ExtractedImage[] = [];

      // console.log("DEBUG: syncUnassignedFromContent", {
      //   foundIds: Array.from(usedIds),
      //   mapKeys: Object.keys(allImages).length,
      //   sampleMapKey: Object.keys(allImages)[0]
      // });

      Object.entries(allImages).forEach(([id, data]) => {
        if (!usedIds.has(id)) {
          newUnassigned.push({ id, data });
        }
      });

      return {
        ...prev,
        pastedImagesMap: allImages, // Keep consistency
        unassignedImages: newUnassigned
      };
    });
  };

  // Re-parse when pastedImagesMap OR content changes
  // Also sync unassigned images if content changed from OUTSIDE handlePreviewEdit (e.g. GUI edit)
  // BUT avoid double-calc if handlePreviewEdit already did it. 
  // handlePreviewEdit updates 'content' and 'unassignedImages' atomically.
  // GUI update via setPreviewContent updates 'content' only.
  // So we can listen to content change? No, too risky for loops.
  // Better to call syncUnassignedFromContent in handleQuestionSave.

  useEffect(() => {
    const handleOpenImageModal = (event: CustomEvent<{ imageUrl: string }>) => {
      setImageModalUrl(event.detail.imageUrl);
      setImageModalOpen(true);
    };

    window.addEventListener('open-image-modal' as any, handleOpenImageModal);

    return () => {
      window.removeEventListener('open-image-modal' as any, handleOpenImageModal);
    };
  }, []);

  // Always sync questions with content when content changes (including Undo/Redo)
  // This ensures that when undo/redo happens, questions state is synced with editorState.content
  useEffect(() => {
    // Skip sync if we're updating content from questions (to avoid infinite loop)
    if (isUpdatingFromQuestionsRef.current) {
      isUpdatingFromQuestionsRef.current = false;
      return;
    }

    // FIX: Skip sync if we're only updating pastedImagesMap from file drop
    // This prevents unnecessary re-parse and scroll when adding uploaded images
    if (isUpdatingPastedImagesRef.current) {
      isUpdatingPastedImagesRef.current = false;
      return;
    }

    if (previewContent !== undefined && previewContent !== '') {
      const parsed = parseEditedContent(previewContent);
      setQuestions(parsed);
    }
  }, [previewContent, pastedImagesMap]);

  // Helper function to protect LaTeX and mathematical expressions before text normalization
  // CRITICAL: Preserves original format, does NOT normalize
  const protectLatexExpressions = (text: string): { text: string; protectedExpressions: string[] } => {
    const protectedExpressions: string[] = [];
    let result = text;

    // Protect display math $$...$$
    result = result.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
      const index = protectedExpressions.length;
      // CRITICAL: Keep original format, only replace newlines with spaces for protection
      // FIX: Do NOT replace newlines with spaces, preserve them for code blocks
      protectedExpressions.push(match);
      return `__LATEX_PROTECTED_${index}__`;
    });

    // Protect inline math $...$
    result = result.replace(/\$[^$\n]+\$/g, (match) => {
      const index = protectedExpressions.length;
      // CRITICAL: Keep original format
      protectedExpressions.push(match);
      return `__LATEX_PROTECTED_${index}__`;
    });

    // Helper to check if a brace group is part of a composite block
    // CRITICAL: Must be more lenient to catch all composite block patterns
    const isCompositeBlockStart = (text: string, braceIndex: number): boolean => {
      // Get context around the brace
      const beforeBrace = text.substring(Math.max(0, braceIndex - 100), braceIndex);
      const afterBrace = text.substring(braceIndex + 1, Math.min(text.length, braceIndex + 200));

      // CRITICAL: First check for MATH OPERATORS immediately before brace
      // This catches subscript/superscript patterns like u_{0}, x^{2}
      // Check the character immediately before { (handle both "_{" and "_ {")
      const trimmedBefore = beforeBrace.trimEnd();
      const lastCharBeforeWhitespace = trimmedBefore.slice(-1);

      // If preceded by _ or ^ (subscript/superscript), this is DEFINITELY math, not composite
      if (lastCharBeforeWhitespace === '_' || lastCharBeforeWhitespace === '^') {
        return false; // NOT a composite block - protect this as math
      }

      // If preceded by = (assignment/set notation like T ={H,E}), check content inside braces
      // Set notation typically has letters/symbols like {H,E}, {I,N,K}
      if (lastCharBeforeWhitespace === '=') {
        // Check if content looks like a set (letters, numbers, commas)
        const contentPreview = afterBrace.substring(0, 50);
        const closingBraceIdx = contentPreview.indexOf('}');
        if (closingBraceIdx > 0) {
          const setContent = contentPreview.substring(0, closingBraceIdx);
          // If set content is simple (letters, numbers, commas, spaces), it's math notation
          if (/^[\w\s,]+$/.test(setContent)) {
            return false; // NOT a composite block - protect this as math
          }
        }
      }

      // Check if { is at start of line or after newline
      const isAtLineStart = braceIndex === 0 || beforeBrace.endsWith('\n');

      // Check if { is preceded by whitespace only (no content before it on same line)
      const lastNewlineIndex = beforeBrace.lastIndexOf('\n');
      const lineBeforeBrace = lastNewlineIndex >= 0
        ? beforeBrace.substring(lastNewlineIndex + 1)
        : beforeBrace;
      const isAfterWhitespaceOnly = /^\s*$/.test(lineBeforeBrace);

      // Check if followed by "Câu" (with optional number and colon) - can be immediately or after whitespace/newline
      const hasCauAfter = /^\s*Câu\s*\d*:?/i.test(afterBrace);

      // Check if followed by newline then "Câu" (common pattern after normalization)
      // Look for newline followed by optional whitespace and "Câu"
      const hasCauOnNextLine = /[\n\r]\s*Câu\s*\d*:?/i.test(afterBrace);

      // Composite block if:
      // 1. At line start AND followed by "Câu" (immediately or on next line)
      // 2. After whitespace only AND followed by "Câu"
      if ((isAtLineStart || isAfterWhitespaceOnly) && (hasCauAfter || hasCauOnNextLine)) {
        return true;
      }

      // Also check if this looks like a structural brace (not math)
      // If it's on its own line or after whitespace, and NOT preceded by math characters
      const lastCharBeforeBrace = lineBeforeBrace.slice(-1);
      const isNotMathContext = !/[a-zA-Z0-9_^=+\-*/]/.test(lastCharBeforeBrace);

      // CRITICAL: If it's at line start or after whitespace only, and not in math context,
      // it's likely a structural brace (composite block), not a math expression
      // We err on the side of NOT protecting it, so the parser can handle it as composite
      // BUT: Only do this if we're reasonably sure it's not math (check a bit more context)
      if ((isAtLineStart || isAfterWhitespaceOnly) && isNotMathContext) {
        // Additional check: if afterBrace doesn't contain math operators immediately, it's likely composite
        const firstFewChars = afterBrace.substring(0, 10).trim();
        const looksLikeMathStart = /^[0-9+\-*/^_=<>]/.test(firstFewChars) ||
          firstFewChars.startsWith('\\') ||
          /^[a-zA-Z]\{/.test(firstFewChars);

        if (!looksLikeMathStart) {
          // This looks like a structural brace, don't protect it as LaTeX
          return true;
        }
      }

      return false;
    };

    // Protect ALL mathematical expressions with braces (not just LaTeX commands)
    let i = 0;
    while (i < result.length) {
      if (result[i] === '{') {
        const braceStart = i;

        // Check if this is a composite block start - if so, skip it
        if (isCompositeBlockStart(result, i)) {
          i++;
          continue;
        }

        // Match the brace group
        let braceCount = 1;
        i++; // skip opening brace

        while (i < result.length && braceCount > 0) {
          if (result[i] === '\\' && i + 1 < result.length) {
            i += 2;
          } else if (result[i] === '{') {
            braceCount++;
            i++;
          } else if (result[i] === '}') {
            braceCount--;
            i++;
          } else {
            i++;
          }
        }

        // If braces matched, protect this expression
        if (braceCount === 0) {
          const braceEnd = i;
          const mathExpr = result.substring(braceStart, braceEnd);

          const beforeExpr = result.substring(Math.max(0, braceStart - 10), braceStart);
          const afterExpr = result.substring(braceEnd, Math.min(result.length, braceEnd + 10));

          const isMathExpr =
            mathExpr.includes('\\') ||
            /[0-9+\-*/^_=<>,\.]/.test(mathExpr) ||
            /[a-zA-Z0-9_^=]/.test(beforeExpr.slice(-1)) ||
            /[a-zA-Z0-9_^=]/.test(afterExpr.charAt(0));

          if (isMathExpr) {
            const index = protectedExpressions.length;
            // CRITICAL: Keep original format, only replace newlines with spaces for protection
            // FIX: Do NOT replace newlines with spaces
            protectedExpressions.push(mathExpr);
            result = result.substring(0, braceStart) + `__LATEX_PROTECTED_${index}__` + result.substring(braceEnd);
            i = braceStart + `__LATEX_PROTECTED_${index}__`.length;
            continue;
          }
        }
      } else {
        i++;
      }
    }

    return { text: result, protectedExpressions };
  };

  // Helper function to restore protected LaTeX expressions
  const restoreLatexExpressions = (text: string, protectedExpressions: string[]): string => {
    let result = text;
    protectedExpressions.forEach((latex, index) => {
      result = result.replace(`__LATEX_PROTECTED_${index}__`, latex);
    });
    return result;
  };

  // Hàm parse nội dung text thành questions
  // SỬ DỤNG GIỐNG HỆT LOGIC CỦA docsParser.parseDocsContent
  const parseEditedContent = (content: string): QuestionWithImages[] => {
    // Pre-process: Normalize smart quotes and newlines (giống docsParser)
    let normalizedContent = content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
      .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes

    // CRITICAL: Protect LaTeX expressions BEFORE normalization to prevent breaking LaTeX braces
    const { text: protectedText, protectedExpressions: latexExpressions } = protectLatexExpressions(normalizedContent);

    // Heuristic: Inject newlines trước một số patterns
    normalizedContent = protectedText
      // Inject newline trước "Câu n:"
      .replace(/([^\n])\s+(Câu\s+\d+|Câu\s*:)/gi, '$1\n$2')

      // FIX: Tách ngoặc nhọn ra dòng riêng để nhận diện composite block (giống docsParser.ts)
      // Split content before { and put { on new line
      .replace(/([^\n\s\\])\s*\{/g, '$1\n{')
      // Split content after { onto next line (but preserve LaTeX braces)
      // Only split if { is not part of LaTeX command (no backslash before it)
      .replace(/([^\\])\{([^\n\s])/g, '$1{\n$2')
      // Handle { at start of line (must be on its own line)
      .replace(/^\s*\{([^\n\s])/gm, '{\n$1')
      // Split content before } onto previous line (but preserve LaTeX braces)
      .replace(/([^\n\s])\s*\}([^\\])/g, '$1\n}$2')
      // Split } from content after it (must be on its own line)
      .replace(/\}([^\n\s])/g, '}\n$1')

      // Keywords đặc biệt (result:, group:)
      // FIX: Ensure result: and group: are always on their own line
      // This is critical for parsing composite blocks correctly, especially in composite questions
      // CRITICAL: Must split result: BEFORE normalizing braces, and ensure it's on its own line
      // First, handle specific patterns (Câu, Options) to avoid conflicts
      .replace(/(Câu\s+\d+:\s*[^\n]+?)\s*(result:|group:)/gi, '$1\n$2')
      .replace(/([A-Z]\.\s*[^\n]+?)\s*(result:|group:)/g, '$1\n$2')
      // Then handle punctuation followed by result: (no space)
      .replace(/([?!.])(result:|group:)/gi, '$1\n$2')
      // Finally, handle general case: any character followed by result: (with or without space)
      // CRITICAL: This must come AFTER brace normalization to avoid conflicts
      .replace(/([^\n])(\s*)(result:|group:)/gm, '$1\n$3')

      // FIX: Normalizing 'Explanation' / 'Giải thích' to always start on a new line
      .replace(/([^\n])\s*(Giải thích:|Explanation:)/gi, '$1\n$2')

      // Remove image placeholder tags
      .replace(/<hình ảnh>/g, "");

    // FIX: Normalize LaTeX braces - remove whitespace/newlines inside braces
    // This fixes {n } → {n} and {n\n} → {n} after image drop
    // NOTE: This only affects structural braces, LaTeX is already protected
    // REMOVED: normalizedContent = normalizedContent.replace(/\{\s+/g, '{');
    // REMOVED: normalizedContent = normalizedContent.replace(/\s+\}/g, '}');

    // CRITICAL: Restore LaTeX expressions AFTER normalization
    normalizedContent = restoreLatexExpressions(normalizedContent, latexExpressions);

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
      // Only flush if we have a question text (allow empty string for new questions)
      if (currentQuestion.question !== undefined) {
        // Default ID if missing
        if (!currentQuestion.id) {
          currentQuestion.id = generateId();
        }

        // Determine type if not explicitly set (e.g. by group/result parsing)
        if (!currentQuestion.type) {
          currentQuestion.type = determineQuestionType(currentCorrectAnswers, currentOptions);
        }

        // Construct final object
        // FIXED: Only use images from parsed content (via [IMAGE:id] tags), not from existingQuestion
        // This makes the text content the single source of truth for image assignments
        const q: QuestionWithImages = {
          id: currentQuestion.id!,
          question: currentQuestion.question,
          type: currentQuestion.type as any,
          correctAnswers: Array.isArray(currentCorrectAnswers) && currentCorrectAnswers.length > 0
            ? currentCorrectAnswers
            : (currentQuestion.correctAnswers || []),
          explanation: currentQuestion.explanation,
          subQuestions: currentQuestion.subQuestions,
          questionImage: currentQuestion.questionImage,
          questionImageId: currentQuestion.questionImageId,
          optionImages: currentQuestion.optionImages || {},
          optionImageIds: currentQuestion.optionImageIds || {},
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

      // 3. Options Detection (Hoist regex)
      // FIX: Allow optional '$' prefix for math context (e.g. $A. content)
      const optionRegex = /([$]?)([*]?)([A-Z])\.\s*/g;
      const hasOptions = /([$]?)([*]?)([A-Z])\.\s*/.test(line);

      // CHECK FOR IMAGE MARKER [IMAGE:id]
      // FIX: Only run global extraction if NO options are detected on this line.
      // If options exist, we handle images INSIDE the option parser to ensure correct association.
      if (!hasOptions) {
        const imgRegex = /\[IMAGE:([^\]]+)\]/g;
        let imgMatchIterator;
        while ((imgMatchIterator = imgRegex.exec(line)) !== null) {
          const imgId = imgMatchIterator[1];
          const imgData = findImage(imgId);

          // Always assign ID to structure for "Usage Tracking"
          // If currently parsing options, assign to last option
          if (currentOptions.length > 0) {
            const lastOption = currentOptions[currentOptions.length - 1];
            if (!currentQuestion.optionImages) currentQuestion.optionImages = {};
            if (!currentQuestion.optionImageIds) currentQuestion.optionImageIds = {};

            currentQuestion.optionImageIds[lastOption] = imgId;
            if (imgData) {
              currentQuestion.optionImages[lastOption] = imgData;
            }
          } else {
            // Assign to question
            currentQuestion.questionImageId = imgId;
            if (imgData) {
              currentQuestion.questionImage = imgData;
            }
          }
        }
        // Remove all markers
        line = line.replace(imgRegex, "").trim();
      }

      if (!line) continue; // Skip line if it only contained the image markers

      // ... (Composite Block Logic - unchanged, kept in context or separate check) 
      // But wait, the original code had text processing logic below.
      // I need to ensure I don't break flow.
      // I will rely on the target context matching.

      // --- COMPOSITE BLOCK HANDLING --- (Skipping in this replacement if possible, but line numbers suggest I need to replace strictly what I touch)
      // I will restrict this replacement block to the Image Handling -> Option Logic, but I need to include the Option Logic modification.
      // The original code has Composite Handling in between lines 778-836.
      // If I want to modify Image Handling (746) AND Option Handling (838), I have a huge block.
      // I should do two replaces?
      // No, `hasOptions` logic links them.
      // I will implement "Step 1: Modify Image Handling" and "Step 2: Modify Option Handling".
      // But `hasOptions` must be defined.
      // I will define `hasOptions` and use it in Step 1.

      // Let's assume I replace the top block first.

      if (!line) continue; // Skip line if it only contained the image markers

      // Helper function to count braces while ignoring LaTeX commands (giống docsParser.ts)
      const countBracesIgnoringLatex = (text: string): { open: number, close: number } => {
        let open = 0;
        let close = 0;
        let i = 0;

        while (i < text.length) {
          // Skip LaTeX commands (backslash followed by letters)
          if (text[i] === '\\' && i + 1 < text.length && /[a-zA-Z]/.test(text[i + 1])) {
            // Skip the command name
            i++;
            while (i < text.length && /[a-zA-Z]/.test(text[i])) {
              i++;
            }
            // Skip any following braces (they're part of the LaTeX command, not structure)
            while (i < text.length && /[\s{]/.test(text[i])) {
              if (text[i] === '{') {
                // Find matching } for this LaTeX argument
                let depth = 1;
                i++;
                while (i < text.length && depth > 0) {
                  if (text[i] === '\\') {
                    i += 2; // Skip escaped char
                  } else if (text[i] === '{') {
                    depth++;
                    i++;
                  } else if (text[i] === '}') {
                    depth--;
                    i++;
                  } else {
                    i++;
                  }
                }
              } else {
                i++;
              }
            }
          } else if (text[i] === '{') {
            open++;
            i++;
          } else if (text[i] === '}') {
            close++;
            i++;
          } else {
            i++;
          }
        }

        return { open, close };
      };

      // Helper to check if a line is a start of a new semantic block
      const isNewBlock = (line: string) => {
        // 1. ID
        if (line.startsWith("ID:")) return true;
        // 2. Question (Câu n:)
        if (line.match(/^Câu\s+\d+|Câu\s*:/i) || (line.startsWith("Câu") && line.includes(":"))) return true;
        // 3. Keywords (result:, group:)
        // CRITICAL: Match with optional whitespace before colon
        if (line.match(/^(result|group)\s*:/i)) return true;
        // 4. Structural ({, })
        // FIX: Enhanced Check (Matches docsParser.ts)
        // Detect opening brace that is explicitly structural (Composite Start),
        // filtering out braces that are likely part of Math/LaTeX expressions.
        const hasMathBrace =
          line.match(/[_^]\s*\{/) ||      // Subscript or superscript (e.g., u_{0})
          line.match(/=\s*\{/) ||         // Set notation (e.g., T ={H,E})
          line.match(/\\\w+\{/) ||        // LaTeX commands (e.g., \frac{...)
          line.match(/\{[^{}]*\}/);       // Inline balanced braces (e.g., {a,b})

        // If line starts with { and doesn't look like math, treat as block start
        if (line.startsWith("{") && !hasMathBrace) return true;

        // 5. Options (*A., A., $A.)
        if (line.match(/^[$]?[*]?\s*[A-Z]\.\s*/)) return true;
        // 6. Explanation
        if (line.match(/^(Giải thích|Explanation)\s*:/i)) return true;

        return false;
      };

      // Helper to accumulate multi-line content
      const accumulateLines = (startIdx: number): { content: string, nextIdx: number } => {
        // Determine separator based on the block type
        // Explanations should preserve newlines, others (result, group) use space for JSON/compactness
        const startLine = lines[startIdx];
        const isExplanation = /^(Giải thích|Explanation)\s*:/i.test(startLine);
        const separator = isExplanation ? '\n' : ' ';

        // CRITICAL: Generalized stripping for result:, group:, Giải thích:, Explanation:
        // Match starts with keys, optional whitespace, colon, optional whitespace
        let content = lines[startIdx].replace(/^(result|group|Giải thích|Explanation)\s*:/i, '').trim();
        let nextIdx = startIdx + 1;

        while (nextIdx < lines.length) {
          const nextLine = lines[nextIdx];
          if (isNewBlock(nextLine)) {
            break;
          }
          content += separator + nextLine;
          nextIdx++;
        }

        return { content: content.trim(), nextIdx: nextIdx - 1 };
      };

      // --- COMPOSITE BLOCK HANDLING ---
      if (isCollectingComposite) {
        // CRITICAL: Count braces while ignoring LaTeX to avoid false closing (giống docsParser.ts)
        const braces = countBracesIgnoringLatex(line);
        compositeBraceCount += braces.open - braces.close;

        if (compositeBraceCount <= 0) {
          // End of composite block
          // CRITICAL: Before ending, check if line contains result: or other content before }
          // If line has content before }, add it to buffer first
          const closingBraceIndex = line.indexOf('}');
          if (closingBraceIndex > 0) {
            const beforeBrace = line.substring(0, closingBraceIndex).trim();
            if (beforeBrace) {
              compositeBuffer.push(beforeBrace);
            }
          }

          isCollectingComposite = false;

          // Recursively parse buffer
          if (compositeBuffer.length > 0) {
            const subQs = parseEditedContent(compositeBuffer.join("\n"));
            currentQuestion.subQuestions = subQs;
            currentQuestion.type = "composite";

            // NEW: Check for Post-Block Explanation (after closing bracket)
            let lookAheadIdx = i + 1;
            while (lookAheadIdx < lines.length) {
              const nextLine = lines[lookAheadIdx];
              if (!nextLine.trim()) {
                lookAheadIdx++;
                continue;
              }

              if (nextLine.match(/^(Giải thích|Explanation)\s*:/i)) {
                // Found explanation! Parse it.
                const { content, nextIdx } = accumulateLines(lookAheadIdx);
                currentQuestion.explanation = content;

                // Advance main loop index to skip parsing this explanation again
                i = nextIdx;
              }
              break; // Stop looking after checking the immediate next semantic block
            }

            flushQuestion();
          }
          compositeBuffer = [];
        } else {
          compositeBuffer.push(line);
        }
        continue;
      }

      // Check start of Composite Block (giống docsParser.ts)
      // CRITICAL FIX: Only match standalone "{", not LaTeX like "\frac{1}{2}"
      // After normalization, { should be on its own line or at start
      const trimmedLine = line.trim();

      // Check if this is a composite block start
      // Must have: currentQuestion.question exists, not already collecting, and line starts with {
      const isStandaloneBrace = trimmedLine === '{' || trimmedLine === '{ ';
      const hasBraceAtStart = trimmedLine.startsWith('{') && !trimmedLine.match(/^\\[a-zA-Z]+\{/);
      const shouldStartComposite = (isStandaloneBrace || hasBraceAtStart) && currentQuestion.question && !isCollectingComposite;

      if (shouldStartComposite) {
        isCollectingComposite = true;
        const braceIndex = line.indexOf('{');
        const afterBrace = line.substring(braceIndex + 1).trim();

        // Count braces in this line using LaTeX-aware counter
        const braces = countBracesIgnoringLatex(line);
        compositeBraceCount = braces.open - braces.close;

        // If there's content after {, add it to buffer (but don't add if it's just })
        if (afterBrace && afterBrace !== '}') {
          compositeBuffer.push(afterBrace);
        }

        // If braces are balanced on same line (e.g., "{}"), don't start composite mode
        if (compositeBraceCount <= 0) {
          isCollectingComposite = false;
          compositeBraceCount = 0;
          compositeBuffer = [];
        }
        continue;
      }

      // --- STANDARD PARSING ---

      // 1. Explicit ID (Optional)
      if (line.startsWith("ID:")) {
        if (currentQuestion.question !== undefined) flushQuestion();

        // FIX: Allow dots in ID just in case (though we should generate safe IDs)
        const idMatch = line.match(/ID:\s*([\w-.]+)/);
        currentQuestion = {
          id: idMatch ? idMatch[1] : generateId()
        };
        continue;
      }

      // 2. Question Text (Câu n:)
      if (line.startsWith("Câu") && (line.includes(":") || line.match(/^Câu\s+\d+/i))) {
        if (currentQuestion.question !== undefined) flushQuestion();

        // Extract text after colon
        const colonIndex = line.indexOf(":");
        const text = line.substring(colonIndex + 1).trim();

        // Inherit ID if set, otherwise gen
        if (!currentQuestion.id) currentQuestion.id = generateId();
        currentQuestion.question = text;
        continue;
      }

      // 3. Options (A. B. C. D.) — ROBUST PARSER
      // optionOptionRegex already defined above for hoisting


      let match: RegExpExecArray | null;

      const optionMatches: {
        isCorrect: boolean;
        hasMathPrefix: boolean;
        index: number;
        length: number;
      }[] = [];

      while ((match = optionRegex.exec(line)) !== null) {
        // match[1] is $, match[2] is *, match[3] is Letter
        optionMatches.push({
          hasMathPrefix: match[1] === "$",
          isCorrect: match[2] === "*",
          index: match.index,
          length: match[0].length,
        });
      }

      if (optionMatches.length > 0) {
        // Handle text BEFORE first option (e.g. "[IMAGE] A. ...")
        const preText = line.substring(0, optionMatches[0].index).trim();
        if (preText) {
          const imgInPreRegex = /\[IMAGE:([^\]]+)\]/g;
          let m;
          while ((m = imgInPreRegex.exec(preText)) !== null) {
            const imgId = m[1];
            const imgData = findImage(imgId);
            // Assign to last option if exists, else Question
            if (currentOptions.length > 0) {
              const last = currentOptions[currentOptions.length - 1];
              if (!currentQuestion.optionImages) currentQuestion.optionImages = {};
              if (!currentQuestion.optionImageIds) currentQuestion.optionImageIds = {};
              currentQuestion.optionImageIds[last] = imgId;
              if (imgData) currentQuestion.optionImages[last] = imgData;
            } else {
              currentQuestion.questionImageId = imgId;
              if (imgData) currentQuestion.questionImage = imgData;
            }
          }
        }

        for (let i = 0; i < optionMatches.length; i++) {
          const start = optionMatches[i].index + optionMatches[i].length;
          const end =
            i + 1 < optionMatches.length
              ? optionMatches[i + 1].index
              : line.length;

          let content = line.substring(start, end).trim();

          // EXTRACT IMAGES FROM OPTION CONTENT
          const imgInOptRegex = /\[IMAGE:([^\]]+)\]/g;
          const imagesInThisOption: { id: string, data?: string }[] = [];

          let m;
          while ((m = imgInOptRegex.exec(content)) !== null) {
            imagesInThisOption.push({ id: m[1], data: findImage(m[1]) });
          }
          // Remove tags
          content = content.replace(imgInOptRegex, "").trim();

          // FIX: Allow empty content for options (e.g. initial state "A. ", "B. ")
          // Logic: If it matched the regex, it IS an option, even if empty.
          if (content.length >= 0 || imagesInThisOption.length > 0) {
            // FIX: If option had '$' prefix, prepend '$' to content to fix broken LaTeX
            if ((optionMatches[i] as any).hasMathPrefix) {
              content = "$" + content;
            }

            currentOptions.push(content);

            // Assign images to THIS option
            if (imagesInThisOption.length > 0) {
              if (!currentQuestion.optionImages) currentQuestion.optionImages = {};
              if (!currentQuestion.optionImageIds) currentQuestion.optionImageIds = {};

              // Use last image found
              const lastImg = imagesInThisOption[imagesInThisOption.length - 1];

              // Handle Key Collision for identical text (common with empty text)
              // We append invisible spaces to make key unique in the MAP, 
              // but currentOptions must match that key for the UI to link them.
              // Wait, if we change key in map, we MUST change content in currentOptions array too.
              let uniqueKey = content;
              while (currentQuestion.optionImageIds[uniqueKey]) {
                uniqueKey += " ";
              }

              // If we changed the key, we must update the pushed option
              if (uniqueKey !== content) {
                currentOptions.pop();
                currentOptions.push(uniqueKey);
                // Update 'content' var for correctAnswers check below
                content = uniqueKey;
              }

              currentQuestion.optionImageIds[content] = lastImg.id;
              if (lastImg.data) currentQuestion.optionImages[content] = lastImg.data;
            }

            if (optionMatches[i].isCorrect && Array.isArray(currentCorrectAnswers)) {
              (currentCorrectAnswers as string[]).push(content);
            }
          }
        }
        continue;
      }




      // 4. Fill-in / Drag Result (result: ...)
      // CRITICAL: Check for result: with case-insensitive match and allow optional whitespace
      const resultMatch = line.match(/^result\s*:/i);
      if (resultMatch) {
        const { content, nextIdx } = accumulateLines(i);
        i = nextIdx; // Update loop index

        // CRITICAL: Ensure currentCorrectAnswers is always an array for text type
        if (!Array.isArray(currentCorrectAnswers)) {
          currentCorrectAnswers = [];
        }

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
            // console.warn("Failed to parse result array", e);
            // Fallback to text
            currentCorrectAnswers = [content];
            currentQuestion.type = 'text';
          }
        }
        // Check for quoted multiple answers: "A", "B" (Comma separated quoted strings)
        else if (content.includes('"')) {
          // Regex to find all "quoted parts"
          const matches = content.match(/"([^"]+)"/g);

          if (matches && matches.length > 0) {
            const answers = matches.map(m => m.replace(/^"|"$/g, ''));

            // CRITICAL: Always set answers for text type (don't append if type was different)
            currentCorrectAnswers = answers;
            currentQuestion.type = 'text';
          } else {
            // Quotes exist but parsing failed? Fallback
            currentCorrectAnswers = [content];
            currentQuestion.type = 'text';
          }
        } else {
          // Simple text result (Unquoted, legacy)
          // Treat whole line as one answer
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
            // console.warn("Error parsing group items", e);
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

      // 6. Explanation (case-insensitive & multi-line)
      if (line.match(/^(Giải thích|Explanation)\s*:/i)) {
        const { content, nextIdx } = accumulateLines(i);
        i = nextIdx; // Update loop index
        currentQuestion.explanation = content;
        continue;
      }

      // 7. Fallback: Multiline / Continuation
      // If line didn't match any marker, assume it belongs to the previous context
      if (currentOptions.length > 0) {
        // Append to last option
        const lastIdx = currentOptions.length - 1;
        // Use a space separator if the line appears to be a separate word, or just newline?
        // User request is multiline support -> so Newline.
        const oldVal = currentOptions[lastIdx];
        const newVal = oldVal + '\n' + line;
        currentOptions[lastIdx] = newVal;

        // Sync correctAnswers if holding the value (and not a map)
        if (Array.isArray(currentCorrectAnswers)) {
          const idx = currentCorrectAnswers.indexOf(oldVal);
          if (idx !== -1) {
            currentCorrectAnswers[idx] = newVal;
          }
        }
      } else if (currentQuestion.question) {
        // Append to question
        currentQuestion.question += '\n' + line;
      }
    }

    // Flush last question
    flushQuestion();

    // Flush last question
    flushQuestion();

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
          // console.log(`✓ Uploaded questionImage for Q${i + 1}: ${url}`);
        } catch (error) {
          // console.error(
          //   `✗ Failed to upload questionImage for Q${i + 1}:`,
          //   error
          // );
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
                // console.log(
                //   `✓ Uploaded optionImage for Q${i + 1} option ${j}: ${url}`
                // );
              } catch (error) {
                // console.error(
                //   `✗ Failed to upload optionImage for Q${i + 1} option ${j}:`,
                //   error
                // );
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
                // console.log(
                //   `✓ Uploaded optionImage for Q${i + 1} "${key}": ${url}`
                // );
              } catch (error) {
                // console.error(
                //   `✗ Failed to upload optionImage for Q${i + 1} "${key}":`,
                //   error
                // );
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

  // Auto-scroll preview panel when cursor changes in editor
  const scrollToQuestionPreview = React.useCallback((questionId: string | null) => {
    if (!questionId) return;

    const card = questionCardRefs.current.get(questionId);
    if (!card) return;

    card.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }, []);

  // Page-level drop handler for drop-anywhere feature
  const handlePageDragOver = (e: React.DragEvent) => {
    if (!isDraggingImage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handlePageDrop = (e: React.DragEvent) => {
    if (!isDraggingImage || !draggedImageRef.current) return;

    // Check if dropped OUTSIDE question cards
    const target = e.target as HTMLElement;
    const isInsideQuestionCard = target.closest('[data-qid]');

    if (!isInsideQuestionCard) {
      e.preventDefault();
      e.stopPropagation();
      handleImageRestoreFromDrag(draggedImageRef.current);
    }

    setIsDraggingImage(false);
    draggedImageRef.current = null;
  };

  const handleImageMoved = (source: any) => {
    // Logic to remove image from source after successful move
    if (!source || !source.questionId) return;

    setQuestions(prevQuestions => {
      return prevQuestions.map(q => {
        if (q.id === source.questionId) {
          const newQ = { ...q };
          // Case 1: Question Image
          if (source.sourceType === 'question') {
            newQ.questionImage = undefined;
            newQ.questionImageId = undefined;
          }
          // Case 2: Option Image
          else if (source.sourceType === 'option' && source.optionText) {
            if (newQ.optionImages) {
              const newOptionImages = { ...newQ.optionImages };
              delete newOptionImages[source.optionText];
              newQ.optionImages = newOptionImages;
            }
            if (newQ.optionImageIds) {
              const newOptionImageIds = { ...newQ.optionImageIds };
              delete newOptionImageIds[source.optionText];
              newQ.optionImageIds = newOptionImageIds;
            }
          }

          // Also update the edit map if this question is being edited
          if (editedQuestionsMapRef.current.has(q.id)) {
            editedQuestionsMapRef.current.set(q.id, newQ);
            // Force UI update if needed? 
            // Actually if we update 'questions' state, the editor might not re-render if it uses local state.
            // But usually Edit mode relies on local state 'editedQuestion'. 
            // We might need to force update the editor.
            // Ideally we should use a global event or context, but for now updating the Map + State helps.
          }

          return newQ;
        }
        return q;
      });
    });

    // Also notify if there is a helper for this
    // handleRemoveImageFromSource(source); // Ensure this exists if we uncomment
  };

  // Callback when an external image file is dropped into QuizPreview editor
  const handleImageFileDropped = (imageId: string, imageData: string) => {
    // FIX: Set flag to prevent useEffect from triggering re-parse
    // This avoids auto-scroll when adding images to pastedImagesMap
    isUpdatingPastedImagesRef.current = true;

    // Add the image to pastedImagesMap so it can be tracked and used
    setPastedImagesMap(prev => ({
      ...prev,
      [imageId]: imageData
    }));
  };

  const handleImageDragEnd = (e: React.DragEvent) => {
    // Revert: We now rely on onImageMoved callback from QuizPreview
    // Debug: Checking dropEffect
    // toast.info(`Drop effect: ${e.dataTransfer.dropEffect}`); 

    // We no longer rely on dropEffect here to avoid double-delete or unstable behavior
    setIsDraggingImage(false);
    draggedImageRef.current = null;
  };

  const handlePublish = async () => {
    try {
      setIsPublishing(true);
      // Khi publish thì không cần giữ draft nữa
      autoSaveDisabledRef.current = true;

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
      // console.log("Uploading images before publishing...");
      const questionsWithUrls = await uploadImagesInQuestions(cleanedQuestions);
      // console.log("All images uploaded successfully!");

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
      // console.error("Error publishing quiz:", error);
      toast.error("Có lỗi xảy ra khi xuất bản");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCancel = () => {
    if (
      window.confirm(
        "Bạn có chắc chắn muốn hủy bỏ mọi thay đổi?\n\nTất cả các chỉnh sửa chưa lưu sẽ bị mất và trạng thái sẽ quay về như cũ."
      )
    ) {
      // Tắt auto-save để effect không ghi lại dữ liệu sau khi đã xóa
      autoSaveDisabledRef.current = true;
      localStorage.removeItem("quiz_edit_progress");
      navigate("/classes"); // Or navigate(-1) but explicit path is safer for "cancel" action
    }
  };

  useEffect(() => {
    // console.log("EditQuizPage: received state", state);

    if (!state) {
      // console.log("No state provided, redirecting");
      toast.error("Không có thông tin quiz");
      navigate("/create");
      return;
    }

    // Kiểm tra xem có phải là manual quiz không (từ nút "Tạo bài trắc nghiệm")
    if (
      state.fileName === "Quiz thủ công" &&
      (!state.questions || state.questions.length === 0)
    ) {
      // console.log("Manual quiz - initializing empty questions");
      setQuestions([]);
      setQuizTitle("Quiz thủ công");
      setQuizDescription("Bài trắc nghiệm tạo thủ công");
      setPreviewContent("");
      return;
    }

    // Với file upload - cần có câu hỏi hoặc text từ AI
    if ((!state?.questions || state.questions.length === 0) && !state?.aiTextContent) {
      // console.log("No questions or AI text found, redirecting");
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
        questionImageId: (q as any).questionImageId, // FIXED: Preserve ID to prevent regeneration
        optionImageIds: (q as any).optionImageIds, // FIXED: Preserve ID map
      })
    );
    setQuestions(convertedQuestions);

    // Extract existing images to initial map AND assign IDs to questions
    const initialImagesMap: Record<string, string> = {};
    const usedIds = new Set<string>();
    const duplicateCounters: Record<string, number> = {};

    // Helper to extract and return ID
    const extractAndGetId = (imgData?: string, originalId?: string): string | undefined => {
      if (!imgData) return undefined;

      // FIX: FORCE UNIQUE ID for every occurrence with SEQUENTIAL SUFFIX
      // If originalId exists, use it as base.
      let baseId = originalId;

      // If no ID, generate a base one
      if (!baseId) {
        baseId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }

      let finalId = baseId;

      // Check for collision in THIS session
      if (usedIds.has(finalId)) {
        // Collision detected. Use counter for this baseId.
        if (!duplicateCounters[baseId]) {
          duplicateCounters[baseId] = 0;
        }
        duplicateCounters[baseId]++; // Increment counter
        finalId = `${baseId}-${duplicateCounters[baseId]}`; // Append suffix: -1, -2, etc.
      } else {
        // First time seeing this baseId, we keep it as is.
        // But we assume count 0 if we see it again? No, next time usedIds.has() will be true.
      }

      // Add to map and mark as used
      initialImagesMap[finalId] = imgData;
      usedIds.add(finalId);
      return finalId;
    };

    // Process all questions and assign IDs
    convertedQuestions.forEach(q => {
      // Question image
      if (q.questionImage) {
        q.questionImageId = extractAndGetId(q.questionImage, (q as any).questionImageId);
      }

      // Option images
      if (q.optionImages) {
        const oldOptionIds = q.optionImageIds || {};
        q.optionImageIds = {};
        for (const [optionText, imgData] of Object.entries(q.optionImages)) {
          // We might not have per-option ID from parser easily, pass undefined to auto-gen
          // OR if the parser gave us IDs, pass them. Assuming undefined for now unless extended.
          const imgId = extractAndGetId(imgData, oldOptionIds[optionText]);
          if (imgId) {
            q.optionImageIds[optionText] = imgId;
          }
        }
      }

      // Subquestions
      if (q.subQuestions) {
        q.subQuestions.forEach(sq => {
          const subQ = sq as QuestionWithImages;
          if (subQ.questionImage) {
            subQ.questionImageId = extractAndGetId(subQ.questionImage, (subQ as any).questionImageId);
          }
          if (subQ.optionImages) {
            const oldSubOptionIds = subQ.optionImageIds || {};
            subQ.optionImageIds = {};
            for (const [optionText, imgData] of Object.entries(subQ.optionImages)) {
              const imgId = extractAndGetId(imgData, oldSubOptionIds[optionText]);
              if (imgId) {
                subQ.optionImageIds[optionText] = imgId;
              }
            }
          }
        });
      }
    });

    // Khởi tạo preview content WITH the map
    // Nếu có text từ AI (Theory mode), ưu tiên sử dụng nó thay vì generate từ questions (thường đang rỗng)
    const initialPreviewContent = state.aiTextContent || generatePreviewContent(convertedQuestions, initialImagesMap);

    // FIX: Calculate initial unassignedImages using same logic as handlePreviewEdit
    // Extract all [IMAGE:id] tags from initial content to identify assigned images
    const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
    const imageIdsInInitialContent = new Set<string>();
    let match;
    while ((match = imageTagRegex.exec(initialPreviewContent)) !== null) {
      imageIdsInInitialContent.add(match[1]);
    }

    // ROBUST CALCULATION for Initial Unassigned Images (ID-BASED)
    // We strictly use ID presence in content to determine if an image is "Assigned".
    // 1. imageIdsInInitialContent already contains all [IMAGE:id] tags found in text.

    // 2. Filter unassigned images (ID not in content)
    let initialUnassignedImages: import('../types').ExtractedImage[] = [];

    // DEBUG: Log state to diagnose ID regeneration issues
    // console.log("Initializing EditQuizPage. State Questions sample:", state.questions?.[0]);
    // console.log("State Unassigned Images:", state.unassignedImages?.length);

    // FIX: Restore unassignedImages from state if available (Priority to saved state)
    // This handles the "Editor Reload" case where we want to preserve the exact gallery state
    // instead of recalculating (which might resurrect ghost images).
    if (state.unassignedImages && Array.isArray(state.unassignedImages)) {
      // console.log("Restoring unassignedImages from state:", state.unassignedImages.length);
      initialUnassignedImages = state.unassignedImages;
      // Optional: We could validate these against content just to be safe, 
      // but trusting state prevents "Ghosts".
    } else {
      // console.log("Calculating unassignedImages from initialImagesMap.");
      // Fallback: Calculate from initial map (for new imports logic remains same)
      Object.entries(initialImagesMap).forEach(([id, data]) => {
        // If ID is found in content tags, it is assigned.
        if (imageIdsInInitialContent.has(id)) return;

        // Otherwise, it is unassigned.
        // Let's maintain visual deduplication for gallery:
        const isAlreadyInGallery = initialUnassignedImages.some(img => img.data === data);
        if (!isAlreadyInGallery) {
          initialUnassignedImages.push({ id, data });
        }
      });
    }

    // Update Editor State directly with properly calculated unassignedImages
    setEditorState(prev => ({
      ...prev,
      content: initialPreviewContent,
      pastedImagesMap: {
        ...initialImagesMap
      },
      unassignedImages: initialUnassignedImages // Set correct initial unassigned images
    }));

    // RESTORE PASTED IMAGES MAP FROM SAVED STATE IF AVAILABLE
    if (state.pastedImagesMap) {
      setEditorState(prev => ({
        ...prev,
        pastedImagesMap: {
          ...prev.pastedImagesMap,
          ...state.pastedImagesMap
        }
      }));
    }

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
    if (autoSaveDisabledRef.current) return;

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
            // Include images for persistence (handled in try/catch for quota)
            questionImage: q.questionImage,
            optionImages: q.optionImages,
            questionImageId: q.questionImageId,
            optionImageIds: q.optionImageIds,
          })),
          // IMPORTANT: Save image map to restore unassigned/pasted images
          pastedImagesMap: pastedImagesMap,
          // FIX: Persist unassignedImages explicitly as requested by user
          unassignedImages: unassignedImages
        },
        className: state.classInfo?.name || "",
        quizId: state.fileId, // Using fileId as identifier
        originalTitle: state.quizTitle || quizTitle // Save original title for display in Resumer
      };

      try {
        localStorage.setItem("quiz_edit_progress", JSON.stringify(dataToSave));
      } catch (error) {
        // console.warn("Failed to save progress to localStorage:", error);
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          // Provide feedback but don't spam toasts on every keystroke save
          // Maybe set internal flag that "saving failed"
        }
      }
    };

    const timer = setTimeout(saveProgress, 1000); // Debounce save
    return () => clearTimeout(timer);
  }, [questions, quizTitle, quizDescription, state, pastedImagesMap, unassignedImages]); // Added unassignedImages dependency

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
    updatedQuestion: Partial<QuestionWithImages>,
    options?: { exitEditMode?: boolean }
  ) => {
    // console.log("Saving question:", questionId, updatedQuestion); // Debug log

    // FIX: Register new images (from GUI upload/paste) into pastedImagesMap immediately
    // ensuring generatePreviewContent can produce [IMAGE:id] tags and QuizPreview can render them.
    const newImagesToRegister: Record<string, string> = {};
    const currentMap = editorState.pastedImagesMap || {};

    const processImage = (imgData?: string, existingId?: string): string | undefined => {
      if (!imgData) return undefined;
      // If we have an ID and it matches map, keep it.
      if (existingId && currentMap[existingId] === imgData) return existingId;

      // If we have an ID but data is missing in map (rare), or data differs?
      // Or if no ID. We register as new.
      // Check if this EXACT data is already in newImagesToRegister (dedupe within this save)
      // (Optional optimization)

      const newId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      newImagesToRegister[newId] = imgData;
      return newId;
    };

    // 1. Process Question Image
    if (updatedQuestion.questionImage) {
      updatedQuestion.questionImageId = processImage(updatedQuestion.questionImage, updatedQuestion.questionImageId);
    }

    // 2. Process Option Images
    if (updatedQuestion.optionImages) {
      if (!updatedQuestion.optionImageIds) updatedQuestion.optionImageIds = {};
      for (const [opt, data] of Object.entries(updatedQuestion.optionImages)) {
        const pid = processImage(data, updatedQuestion.optionImageIds[opt]);
        if (pid) updatedQuestion.optionImageIds[opt] = pid;
      }
    }

    // 3. Process SubQuestions (Composite)
    if (updatedQuestion.subQuestions) {
      updatedQuestion.subQuestions.forEach((subQ: any) => { // Type force for flexibility
        if (subQ.questionImage) {
          subQ.questionImageId = processImage(subQ.questionImage, subQ.questionImageId);
        }
        if (subQ.optionImages) {
          if (!subQ.optionImageIds) subQ.optionImageIds = {};
          for (const [opt, data] of Object.entries(subQ.optionImages as Record<string, string>)) {
            const pid = processImage(data, subQ.optionImageIds[opt]);
            if (pid) subQ.optionImageIds[opt] = pid;
          }
        }
      });
    }

    // ATOMIC UPDATE: Update questions, editorState (content + images + unassigned) in one go
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

          // console.log("Question after save:", result); // Debug log
          return result;
        }
        return q;
      });

      // console.log("Updated questions array:", updated); // Debug log
      if (options?.exitEditMode ?? true) {
        setIsEditing(null);
      }

      // Set flag to prevent infinite loop in useEffect
      isUpdatingFromQuestionsRef.current = true;

      // ATOMIC UPDATE: Update editorState with content, images, and unassigned images in one go
      setEditorState(prev => {
        // Merge new images into map
        const updatedMap = {
          ...prev.pastedImagesMap,
          ...newImagesToRegister
        };

        // Generate new content from updated questions with updated map
        const newPreviewContent = generatePreviewContent(updated, updatedMap);

        // Recalculate unassigned images based on new content
        const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
        const usedIds = new Set<string>();
        let match;
        while ((match = imageTagRegex.exec(newPreviewContent)) !== null) {
          usedIds.add(match[1]);
        }

        const newUnassigned: import('../types').ExtractedImage[] = [];
        Object.entries(updatedMap).forEach(([id, data]) => {
          if (!usedIds.has(id)) {
            newUnassigned.push({ id, data });
          }
        });

        return {
          ...prev,
          content: newPreviewContent,
          pastedImagesMap: updatedMap,
          unassignedImages: newUnassigned
        };
      });

      return updated;
    });
  };

  useEffect(() => {
    handleQuestionSaveRef.current = handleQuestionSave;
  }, [handleQuestionSave]);

  // Hàm tạo nội dung preview từ questions
  // TẠO CONTENT THEO ĐÚNG FORMAT CỦA docsParser
  const generatePreviewContent = (questionsArray: QuestionWithImages[], overrideMap?: Record<string, string>) => {
    let content = "";

    questionsArray.forEach((q, index) => {
      content += `ID: ${q.id}\n`;
      content += `Câu ${index + 1}: ${q.question}\n`;

      // Append Question Image Tag (NEW LINE)
      if (q.questionImage) {
        // FIX: Prioritize explicit ID if available (preserves unique subIDs)
        const imgId = q.questionImageId || findImageIdByData(q.questionImage, overrideMap);
        if (imgId) {
          content += `[IMAGE:${imgId}]\n`;
        } else {
          // console.warn("generatePreviewContent: Missing ID for question image!", { qId: q.id, hasImage: !!q.questionImage });
        }
      }

      // Append Explanation if exists
      if (q.explanation) {
        content += `Giải thích: ${q.explanation}\n`;
      }

      if (q.type === "text") {
        // Format: result: "answer1", "answer2", ... (giống docsParser.ts)
        const answers = Array.isArray(q.correctAnswers)
          ? (q.correctAnswers as string[]).filter((a) => a.trim())
          : [];
        if (answers.length > 0) {
          if (answers.length === 1) {
            // Single answer - can be unquoted or quoted
            content += `result: "${answers[0]}"\n`;
          } else {
            // Multiple answers - must be quoted and comma-separated
            const quotedAnswers = answers.map(a => `"${a}"`).join(", ");
            content += `result: ${quotedAnswers}\n`;
          }
        }
      } else if (q.type === "composite") {
        // Format: { ... sub-questions ... }
        content += `{\n`;
        if (q.subQuestions && q.subQuestions.length > 0) {
          q.subQuestions.forEach((subQ, subIdx) => {
            content += `Câu ${subIdx + 1}: ${subQ.question}`;
            if ((subQ as any).questionImage) {
              // FIX: Prioritize explicit ID
              const imgId = (subQ as any).questionImageId || findImageIdByData((subQ as any).questionImage, overrideMap);
              if (imgId) content += `\n[IMAGE:${imgId}]`;
            }
            content += "\n";

            if (subQ.type === "text") {
              const answers = Array.isArray(subQ.correctAnswers)
                ? (subQ.correctAnswers as string[]).filter((a) => a.trim())
                : [];
              if (answers.length > 0) {
                // Format: result: "answer1", "answer2", ... (giống docsParser.ts)
                if (answers.length === 1) {
                  // Single answer - can be unquoted or quoted
                  content += `result: "${answers[0]}"\n`;
                } else {
                  // Multiple answers - must be quoted and comma-separated
                  const quotedAnswers = answers.map(a => `"${a}"`).join(", ");
                  content += `result: ${quotedAnswers}\n`;
                }
              }
              // Append Sub-Question Explanation
              if (subQ.explanation) {
                content += `Giải thích: ${subQ.explanation}\n`;
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
                  // FIX: Prioritize explicit ID for options
                  const explicitId = (subQ as any).optionImageIds && (subQ as any).optionImageIds[opt];
                  const imgId = explicitId || findImageIdByData((subQ as any).optionImages[opt], overrideMap);
                  if (imgId) content += `\n[IMAGE:${imgId}]`;
                }
                content += "\n";
              });
              // Append Sub-Question Explanation
              if (subQ.explanation) {
                content += `Giải thích: ${subQ.explanation}\n`;
              }
            }

            // Add blank line between sub-questions
            if (subIdx < q.subQuestions!.length - 1) {
              content += "\n";
            }
          });
        }
        content += `}\n`;
      } else if (q.type === "drag") {
        // ... existing drag logic ...
        // (Drag questions logic continues below, unchanged by this block, assuming replace matches context)

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

          // FIX: Build lookup map to convert item IDs to Labels for text generation
          const idToLabel: Record<string, string> = {};
          if (dragOptions.items) {
            dragOptions.items.forEach((item: any) => {
              idToLabel[item.id] = item.label || item.id;
            });
          }

          if (mapping) {
            Object.entries(mapping).forEach(([itemId, targetId]) => {
              // Use the label if available (to match result: parsing logic), fallback to ID
              const valToUse = idToLabel[itemId] || itemId;

              if (groupsByTarget[targetId]) {
                groupsByTarget[targetId].push(valToUse);
              } else {
                groupsByTarget[targetId] = [valToUse];
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
              // FIX: Prioritize explicit ID for options
              const explicitId = (q as any).optionImageIds && (q as any).optionImageIds[option];
              const imgId = explicitId || findImageIdByData((q as any).optionImages[option], overrideMap);
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
      // const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      // We process undo even in inputs to ensure Global State consistency
      // if (isInput) return; 

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

  // Helper: Update preview content from current editing state (including edited questions)
  // This allows preview to reflect changes without closing edit mode
  const updatePreviewFromEditMap = () => {
    const updatedQuestions = questions.map(q => {
      // If this question is being edited, use the edited version from map
      const editedVersion = editedQuestionsMapRef.current.get(q.id);
      return editedVersion || q;
    });
    const newPreviewContent = generatePreviewContent(updatedQuestions);
    setPreviewContent(newPreviewContent);
  };

  const handleAddQuestion = () => {
    const newQuestion: QuestionWithImages = {
      // FIX: Generate SAFE alphanumeric ID to match parser expectations
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    // UX IMPROVEMENT: Prioritize editing the OLDEST empty question
    // If user clicks "Add" multiple times, we stay on the first unfinished question.
    // Logic: Find first question with empty content.
    const firstEmptyQuestion = questions.find(q => !q.question || q.question.trim() === "");

    // If we found an existing empty question, focus it. Otherwise focus the new one.
    const targetId = firstEmptyQuestion ? firstEmptyQuestion.id : newQuestion.id;

    setIsEditing(targetId);

    // Scroll to target question and focus
    setTimeout(() => {
      const element = document.querySelector(`[data-qid="${targetId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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
    // Buffer logic removed for immediate feedback
    // Images are restored immediately via handleRestoreToGallery passed to ImageUpload

    const saveAndFlush = (id: string, data: any) => {
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

      // console.log("Edited question before save:", editedQuestion); // Debug log

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

        // console.log("Saving text question with data:", updatedData); // Debug log
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

        // console.log("Saving composite question with data:", updatedData); // Debug log
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

        // console.log("Saving multiple choice question with data:", updatedData); // Debug log
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
    const handleQuestionImageUpload = (imageData: string, imageId?: string) => {
      setEditedQuestion((prev) => ({
        ...prev,
        questionImage: imageData,
        questionImageId: imageId || (imageData ? `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}` : undefined)
      }));
    };

    // Handle image uploads for options
    const handleOptionImageUpload = (optionText: string, imageData: string, imageId?: string) => {
      setEditedQuestion((prev) => {
        const newOptionImages = { ...prev.optionImages };
        const newOptionImageIds = { ...prev.optionImageIds };

        if (imageData) {
          newOptionImages[optionText] = imageData;
          newOptionImageIds[optionText] = imageId || `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        } else {
          delete newOptionImages[optionText];
          delete newOptionImageIds[optionText];
        }

        return {
          ...prev,
          optionImages: newOptionImages,
          optionImageIds: newOptionImageIds
        };
      });
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
              <div className="flex gap-4 items-center">
                {/* Nửa trái: Click, kéo thả... */}
                <div className="flex flex-col w-1/2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ảnh cho câu hỏi (tùy chọn)
                  </label>
                  <ImageUpload
                    onImageUpload={handleQuestionImageUpload}
                    currentImage={editedQuestion.questionImage}
                    currentImageId={editedQuestion.questionImageId}
                    placeholder="Thêm ảnh cho câu hỏi"
                    className="w-full"
                    sourceInfo={{
                      sourceType: 'question',
                      questionId: question.id
                    }}
                    onImageClick={handleImageClick}
                    onDragStateChange={(isDragging, dragData) => {
                      // Enable page-level drop handler for drag-to-gallery from edit mode
                      setIsDraggingImage(isDragging);
                      draggedImageRef.current = isDragging ? dragData : null;
                    }}
                    onAssignFromGallery={(id, source) => {
                      // Special case: moving within the same question being edited
                      if (source && source.questionId === question.id) {
                        // Handle atomically within editedQuestion state
                        // Use source.imageData directly since it's not from gallery
                        setEditedQuestion(prev => {
                          const updated = { ...prev };
                          // Remove from source
                          if (source.sourceType === 'option' && source.optionText) {
                            const newOptionImages = { ...prev.optionImages };
                            const newOptionImageIds = { ...prev.optionImageIds };
                            delete newOptionImages[source.optionText];
                            delete newOptionImageIds[source.optionText];
                            updated.optionImages = newOptionImages;
                            updated.optionImageIds = newOptionImageIds;
                          }
                          // Add to destination (question)
                          updated.questionImage = source.imageData;
                          updated.questionImageId = source.imageId || id;
                          return updated;
                        });
                        return;
                      }
                      // Different question or from gallery: handle normally
                      if (source && source.questionId) {
                        // From another question, not gallery
                        handleRemoveImageFromSource(source);
                        // Use source data directly
                        handleQuestionImageUpload(source.imageData, source.imageId || id);
                      } else {
                        // From gallery - update preview without closing edit mode
                        handleAssignImage(id, (data) => {
                          // Build updated question data with new image SYNCHRONOUSLY
                          const updatedQuestion = {
                            ...editedQuestion,
                            questionImage: data,
                            questionImageId: id
                          };
                          // Update local state and map IMMEDIATELY
                          setEditedQuestion(updatedQuestion);
                          editedQuestionsMapRef.current.set(question.id, updatedQuestion);
                          // Update preview to show image immediately, without closing edit mode
                          setTimeout(() => {
                            updatePreviewFromEditMap();
                          }, 50);
                        });
                      }
                    }}
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
                      if (navigator.clipboard && window.ClipboardItem) {
                        try {
                          const items = await navigator.clipboard.read();
                          for (const item of items) {
                            for (const type of item.types) {
                              if (type.startsWith("image/")) {
                                const blob = await item.getType(type);

                                // Check if this is an SVG wrapper (common when pasting from Word)
                                if (type === 'image/svg+xml') {
                                  try {
                                    // Read SVG content
                                    const text = await blob.text();

                                    // Look for embedded base64 image in SVG
                                    const base64Match = text.match(/xlink:href="data:image\/(jpeg|jpg|png|gif);base64,([^"]+)"/i);

                                    if (base64Match) {
                                      // Extract the actual image as data URL
                                      const imageType = base64Match[1].toLowerCase();
                                      const base64Data = base64Match[2];
                                      const dataUrl = `data:image/${imageType === 'jpg' ? 'jpeg' : imageType};base64,${base64Data}`;

                                      handleQuestionImageUpload(dataUrl);
                                      toast.success("Đã dán ảnh từ clipboard!");
                                      return;
                                    }
                                  } catch (svgError) {
                                    console.error('SVG extraction error:', svgError);
                                    // Fall through to regular processing
                                  }
                                }

                                // Not SVG or extraction failed - process normally
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
                        <div className="flex gap-4 items-center">
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
                              currentImageId={editedQuestion.optionImageIds?.[option]}
                              placeholder="Thêm ảnh cho đáp án"
                              className="w-full"
                              sourceInfo={{
                                sourceType: 'option',
                                questionId: question.id,
                                optionText: option
                              }}
                              onImageClick={handleImageClick}
                              onDragStateChange={(isDragging, dragData) => {
                                // Enable page-level drop handler for drag-to-gallery from edit mode
                                setIsDraggingImage(isDragging);
                                draggedImageRef.current = isDragging ? dragData : null;
                              }}
                              onAssignFromGallery={(id, source) => {
                                // Special case: moving within the same question being edited
                                if (source && source.questionId === question.id) {
                                  // Handle atomically within editedQuestion state
                                  // Use source.imageData directly since it's not from gallery
                                  setEditedQuestion(prev => {
                                    const updated = { ...prev };
                                    // Remove from source
                                    if (source.sourceType === 'question') {
                                      updated.questionImage = undefined;
                                      updated.questionImageId = undefined;
                                    } else if (source.sourceType === 'option' && source.optionText) {
                                      const newOptionImages = { ...prev.optionImages };
                                      const newOptionImageIds = { ...prev.optionImageIds };
                                      delete newOptionImages[source.optionText];
                                      delete newOptionImageIds[source.optionText];
                                      updated.optionImages = newOptionImages;
                                      updated.optionImageIds = newOptionImageIds;
                                    }
                                    // Add to destination (this option)
                                    const finalOptionImages = { ...updated.optionImages };
                                    const finalOptionImageIds = { ...updated.optionImageIds };
                                    finalOptionImages[option] = source.imageData;
                                    finalOptionImageIds[option] = source.imageId || id;
                                    updated.optionImages = finalOptionImages;
                                    updated.optionImageIds = finalOptionImageIds;
                                    return updated;
                                  });
                                  return;
                                }
                                // Different question or from gallery: handle normally
                                if (source && source.questionId) {
                                  // From another question, not gallery
                                  handleRemoveImageFromSource(source);
                                  // Use source data directly
                                  handleOptionImageUpload(option, source.imageData, source.imageId || id);
                                } else {
                                  // From gallery - update preview without closing edit mode
                                  handleAssignImage(id, (data) => {
                                    // Build updated question data with new option image SYNCHRONOUSLY
                                    const updatedQuestion = {
                                      ...editedQuestion,
                                      optionImages: {
                                        ...editedQuestion.optionImages,
                                        [option]: data
                                      },
                                      optionImageIds: {
                                        ...editedQuestion.optionImageIds,
                                        [option]: id
                                      }
                                    };
                                    // Update local state and map IMMEDIATELY
                                    setEditedQuestion(updatedQuestion);
                                    editedQuestionsMapRef.current.set(question.id, updatedQuestion);
                                    // Update preview to show image immediately, without closing edit mode
                                    setTimeout(() => {
                                      updatePreviewFromEditMap();
                                    }, 50);
                                  });
                                }
                              }}
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

                                          // Check if this is an SVG wrapper (common when pasting from Word)
                                          if (type === 'image/svg+xml') {
                                            try {
                                              // Read SVG content
                                              const text = await blob.text();

                                              // Look for embedded base64 image in SVG
                                              const base64Match = text.match(/xlink:href="data:image\/(jpeg|jpg|png|gif);base64,([^"]+)"/i);

                                              if (base64Match) {
                                                // Extract the actual image as data URL
                                                const imageType = base64Match[1].toLowerCase();
                                                const base64Data = base64Match[2];
                                                const dataUrl = `data:image/${imageType === 'jpg' ? 'jpeg' : imageType};base64,${base64Data}`;

                                                handleOptionImageUpload(
                                                  option,
                                                  dataUrl
                                                );
                                                toast.success(
                                                  "Đã dán ảnh từ clipboard!"
                                                );
                                                return;
                                              }
                                            } catch (svgError) {
                                              console.error('SVG extraction error:', svgError);
                                              // Fall through to regular processing
                                            }
                                          }

                                          // Not SVG or extraction failed - process normally
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                          Đáp án đúng
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [
                              ...(editedQuestion.subQuestions || []),
                            ];
                            const currentAnswers = Array.isArray(
                              subQ.correctAnswers
                            )
                              ? (subQ.correctAnswers as string[])
                              : [""];
                            updated[subIndex] = {
                              ...subQ,
                              correctAnswers: [...currentAnswers, ""],
                            };
                            setEditedQuestion((prev) => ({
                              ...prev,
                              subQuestions: updated,
                            }));
                          }}
                          className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
                        >
                          <svg
                            className="w-3 h-3"
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
                            placeholder={`Đáp án đúng ${ansIdx + 1}`}
                            rows={1}
                            style={{ resize: "vertical" }}
                          />
                          {(Array.isArray(subQ.correctAnswers)
                            ? (subQ.correctAnswers as string[])
                            : []
                          ).length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [
                                    ...(editedQuestion.subQuestions || []),
                                  ];
                                  const currentAnswers = Array.isArray(
                                    subQ.correctAnswers
                                  )
                                    ? (subQ.correctAnswers as string[])
                                    : [""];
                                  const newAnswers = currentAnswers.filter(
                                    (_: string, i: number) => i !== ansIdx
                                  );
                                  updated[subIndex] = {
                                    ...subQ,
                                    correctAnswers: newAnswers,
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
          )
          }

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
        </div >
      </div >
    );
  };

  const QuestionDisplay: React.FC<{
    question: QuestionWithImages;
    index: number;
    dragHandleProps?: any;
    onImageClick?: (imageUrl: string) => void;
  }> = ({ question, index, dragHandleProps, onImageClick }) => {
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

    const handleDragOver = (e: React.DragEvent, target: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(target);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
    };

    const handleDrop = async (e: React.DragEvent, target: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);

      let imageData = "";

      // 1. Check for assigned image (move operation)
      const assignedSource = e.dataTransfer.getData('image/assigned-source');
      if (assignedSource) {
        try {
          const source = JSON.parse(assignedSource);

          // Special case: moving within the same question (e.g., between options)
          // We need to do this atomically to avoid duplication
          if (source.questionId === question.id) {
            // Atomic update for same-question moves (Swap Logic)
            let newQuestionImage = question.questionImage;
            let newQuestionImageId = question.questionImageId;
            let newOptionImages = { ...question.optionImages };
            let newOptionImageIds = { ...question.optionImageIds };

            // 1. Get Target Current State (to become New Source State)
            let originalTargetData = "";
            let originalTargetId = "";

            if (target === "question") {
              originalTargetData = question.questionImage || "";
              originalTargetId = question.questionImageId || "";
            } else if (target.startsWith("option-")) {
              const tOpt = target.replace("option-", "");
              originalTargetData = question.optionImages?.[tOpt] || "";
              originalTargetId = question.optionImageIds?.[tOpt] || "";
            }

            // 2. Update Target with Source Data
            if (target === "question") {
              newQuestionImage = source.imageData;
              newQuestionImageId = source.imageId;
            } else if (target.startsWith("option-")) {
              const tOpt = target.replace("option-", "");
              newOptionImages[tOpt] = source.imageData;
              if (source.imageId) {
                newOptionImageIds[tOpt] = source.imageId;
              } else {
                delete newOptionImageIds[tOpt];
              }
            }

            // 3. Update Source with Original Target Data (Swap) or Clear
            if (source.sourceType === 'question') {
              if (originalTargetData) {
                newQuestionImage = originalTargetData;
                newQuestionImageId = originalTargetId;
              } else {
                newQuestionImage = undefined;
                newQuestionImageId = undefined;
              }
            } else if (source.sourceType === 'option' && source.optionText) {
              if (originalTargetData) {
                newOptionImages[source.optionText] = originalTargetData;
                if (originalTargetId) {
                  newOptionImageIds[source.optionText] = originalTargetId;
                } else {
                  delete newOptionImageIds[source.optionText];
                }
              } else {
                delete newOptionImages[source.optionText];
                delete newOptionImageIds[source.optionText];
              }
            }

            const updatedDiff: Partial<QuestionWithImages> = {
              questionImage: newQuestionImage,
              questionImageId: newQuestionImageId,
              optionImages: newOptionImages,
              optionImageIds: newOptionImageIds
            };

            handleQuestionSave(question.id, updatedDiff, { exitEditMode: true });
            toast.success("Đã di chuyển ảnh!");
            return;
          }

          // Different question: remove from source first, then add to destination
          handleRemoveImageFromSource(source);
          // Then assign to new location
          saveDroppedImage(source.imageData, target, source.imageId);

          // Nếu đang mở EditMode cho câu hỏi nguồn mà kéo sang quiz card khác
          // thì thoát EditMode sau khi di chuyển ảnh
          if (isEditing && isEditing === source.questionId && source.questionId !== question.id) {
            setIsEditing(null);
          }
          return;
        } catch (error) {
          console.error('Failed to parse assigned source:', error);
        }
      }

      // 2. Check for Internal DnD (Unassigned Image ID)
      const unassignedId = e.dataTransfer.getData("image/unassigned-id");
      if (unassignedId) {
        handleAssignImage(unassignedId, (data) => {
          saveDroppedImage(data, target, unassignedId);
        });
        return;
      }

      // 3. Check for External File Drop
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];

        // Validate it's an image
        if (!file.type.startsWith('image/')) {
          toast.error('Chỉ chấp nhận file ảnh');
          return;
        }

        // Validate file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
          toast.error('Kích thước ảnh không được vượt quá 5MB');
          return;
        }

        // Upload the file
        try {
          toast.loading('Đang upload ảnh...');
          const { ImagesAPI } = await import('../utils/api');
          const { getToken } = await import('../utils/auth');
          const token = getToken();
          if (!token) {
            throw new Error('Vui lòng đăng nhập để upload ảnh');
          }

          const imageUrl = await ImagesAPI.upload(file, token);
          toast.dismiss();
          toast.success('Upload ảnh thành công!');

          // Generate unique ID
          const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

          // FIX: Don't add to pastedImagesMap here - saveDroppedImage -> handleQuestionSave
          // will handle that via processImage(). Adding it here causes duplication in gallery.
          // The image gets properly managed and won't appear in unassigned images.

          // Save to question (this will add to pastedImagesMap via handleQuestionSave)
          saveDroppedImage(imageUrl, target, imageId);
          return;
        } catch (error) {
          toast.dismiss();
          console.error('Upload error:', error);
          toast.error('Lỗi khi upload ảnh: ' + (error as Error).message);
          return;
        }
      }
    };

    const saveDroppedImage = (imgData: string, target: string, sourceId?: string) => {
      // Clone current question to avoid mutating state directly
      const updatedDiff: Partial<QuestionWithImages> = {};

      if (target === "question") {
        updatedDiff.questionImage = imgData;
        // If we have a source ID from gallery, try to use it (processImage in handleQuestionSave will handle registration)
        // If it's a file drop, sourceId is undefined, processImage generates new ID.
        updatedDiff.questionImageId = sourceId;

        // If reusing an unassigned image, we want to Keep it? handleAssignImage handles removal from unassigned list?
        // handleAssignImage calls: callback(data), then setTimeout(handleImageAssigned(id)) which removes it.
        // So we just need to Save.
      } else if (target.startsWith("option-")) {
        const optText = target.replace("option-", "");

        const newOptionImages = { ...question.optionImages };
        // We use the image data directly. The ID logic is handled in handleQuestionSave.
        newOptionImages[optText] = imgData;

        updatedDiff.optionImages = newOptionImages;

        // Pass IDs if available
        if (sourceId) {
          const newOptionImageIds = { ...question.optionImageIds };
          newOptionImageIds[optText] = sourceId;
          updatedDiff.optionImageIds = newOptionImageIds;
        }
      }

      handleQuestionSave(question.id, updatedDiff, { exitEditMode: true });
      toast.success("Đã cập nhật ảnh!");
    };

    return (
      <div
        className="card p-6 mb-4 relative wrapper-node"
        ref={(el) => {
          if (el) {
            questionCardRefs.current.set(question.id, el);
          } else {
            questionCardRefs.current.delete(question.id);
          }
        }}
      >

        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center flex-wrap gap-y-1">
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
            <span className="text-xs text-gray-400 dark:text-gray-500 mr-2">
              ID: {question.id}
            </span>

            <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 mr-2 whitespace-nowrap">
              {question.type === "single"
                ? "Chọn 1 đáp án"
                : question.type === "multiple"
                  ? "Chọn nhiều đáp án"
                  : question.type === "drag"
                    ? "Kéo thả"
                    : question.type === "composite"
                      ? "Câu mẹ"
                      : "Điền từ"}
            </span>

            {(question.questionImage ||
              (question.optionImages &&
                Object.keys(question.optionImages).length > 0)) && (
                <span className="flex items-center text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  <svg
                    className="w-3 h-3 mr-1"
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

        <div
          className={`rounded-lg border-2 border-transparent transition-colors mb-4 ${dragOverTarget === "question"
            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
            : "hover:border-dashed hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          onDragOver={(e) => handleDragOver(e, "question")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "question")}
          title="Kéo thả ảnh vào đây để đặt ảnh cho câu hỏi"
        >
          <h3 className="text-lg font-medium text-gray-900 dark:text-white p-2 whitespace-pre-wrap">
            <MathText text={question.question} />
          </h3>
          {/* Overlay hint when dragging over */}
          {dragOverTarget === "question" && (
            <div className="text-xs text-primary-600 dark:text-primary-400 font-normal px-2 pb-2 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Thả để gán ảnh cho câu hỏi
            </div>
          )}
        </div>

        {/* Question Image Display */}
        {question.questionImage && (
          <div className="mb-4">
            <div className="relative group inline-block">
              <img
                src={question.questionImage}
                alt="Question"
                className="max-w-md max-h-64 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                style={{ cursor: 'grab' }}
                draggable
                onMouseDown={(e) => {
                  // FIX: Track drag state to distinguish click vs drag
                  (e.target as any).dataset.isDragging = 'false';
                }}
                onClick={(e) => {
                  // Only trigger click if not dragging
                  const isDragging = (e.target as any).dataset.isDragging === 'true';
                  if (isDragging) {
                    (e.target as any).dataset.isDragging = 'false';
                    return;
                  }
                  e.stopPropagation();
                  onImageClick ? onImageClick(question.questionImage!) : window.dispatchEvent(new CustomEvent('open-image-modal', { detail: { imageUrl: question.questionImage } }));
                }}
                onDragStart={(e) => {
                  (e.target as any).dataset.isDragging = 'true';
                  const source = {
                    imageData: question.questionImage,
                    imageId: question.questionImageId,
                    sourceType: 'question' as const,
                    questionId: question.id
                  };
                  e.dataTransfer.setData('image/assigned-source', JSON.stringify(source));
                  e.dataTransfer.effectAllowed = 'copyMove';
                  setIsDraggingImage(true);
                  draggedImageRef.current = source;
                }}
                onDragEnd={handleImageDragEnd}
                title="Kéo để di chuyển ảnh sang vị trí khác"
              />
              {/* Quick Remove Button */}
              <button
                type="button"
                onClick={() => {
                  if (question.questionImageId) {
                    const imageTag = `[IMAGE:${question.questionImageId}]`;
                    setPreviewContent(prev => prev.replace(new RegExp(imageTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''));
                  }
                  handleRestoreToGallery(question.questionImage!, question.questionImageId);
                  handleQuestionSave(question.id, {
                    questionImage: undefined,
                    questionImageId: undefined
                  }, { exitEditMode: false });
                }}
                className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg z-10"
                title="Gỡ ảnh về kho"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}



        {question.type !== "text" &&
          question.type !== "composite" &&
          question.options && (
            <div className="space-y-3">
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
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 pt-[2px]">
                        <span
                          className={`font-medium text-gray-600 dark:text-gray-300 ${dragOverTarget === `option-${option}` ? "text-primary-600 dark:text-primary-400" : ""
                            }`}
                        >
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
                      <div
                        className={`flex-1 p-2 rounded-lg border-2 border-transparent transition-colors ${dragOverTarget === `option-${option}`
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                          : ""
                          }`}
                        onDragOver={(e) => handleDragOver(e, `option-${option}`)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, `option-${option}`)}
                        title="Kéo thả ảnh vào đây để đặt ảnh cho đáp án"
                      >
                        <span className="text-gray-900 dark:text-gray-100">
                          <MathText text={option.replace(/\n/g, ' ')} />
                        </span>
                        {/* Option Image Display */}
                        {question.optionImages?.[option] && (
                          <div className="mt-2">
                            <div className="relative group inline-block">
                              <img
                                src={question.optionImages[option]}
                                alt={`Option ${String.fromCharCode(65 + index)}`}
                                className="max-w-xs max-h-32 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                                style={{ cursor: 'grab' }}
                                draggable
                                onMouseDown={(e) => {
                                  // FIX: Track drag state to distinguish click vs drag
                                  (e.target as any).dataset.isDragging = 'false';
                                }}
                                onClick={(e) => {
                                  // Only trigger click if not dragging
                                  const isDragging = (e.target as any).dataset.isDragging === 'true';
                                  if (isDragging) {
                                    (e.target as any).dataset.isDragging = 'false';
                                    return;
                                  }
                                  e.stopPropagation();
                                  onImageClick ? onImageClick(question.optionImages![option]) : window.dispatchEvent(new CustomEvent('open-image-modal', { detail: { imageUrl: question.optionImages![option] } }));
                                }}
                                onDragStart={(e) => {
                                  (e.target as any).dataset.isDragging = 'true';
                                  const source = {
                                    imageData: question.optionImages![option],
                                    imageId: question.optionImageIds?.[option],
                                    sourceType: 'option' as const,
                                    questionId: question.id,
                                    optionText: option
                                  };
                                  e.dataTransfer.setData('image/assigned-source', JSON.stringify(source));
                                  e.dataTransfer.effectAllowed = 'copyMove';
                                  setIsDraggingImage(true);
                                  draggedImageRef.current = source;
                                }}
                                onDragEnd={handleImageDragEnd}
                                title="Kéo để di chuyển ảnh sang vị trí khác"
                              />
                              {/* Quick Remove Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const imageId = question.optionImageIds?.[option];
                                  if (imageId) {
                                    const imageTag = `[IMAGE:${imageId}]`;
                                    setPreviewContent(prev => prev.replace(new RegExp(imageTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''));
                                  }
                                  handleRestoreToGallery(question.optionImages![option], imageId);
                                  const newOptionImages = { ...question.optionImages };
                                  const newOptionImageIds = { ...question.optionImageIds };
                                  delete newOptionImages[option];
                                  delete newOptionImageIds[option];
                                  handleQuestionSave(question.id, {
                                    optionImages: newOptionImages,
                                    optionImageIds: newOptionImageIds
                                  }, { exitEditMode: false });
                                }}
                                className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg z-10"
                                title="Gỡ ảnh về kho"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                        {dragOverTarget === `option-${option}` && (
                          <div className="text-xs text-primary-600 dark:text-primary-400 font-normal mt-1 flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Thả để gán ảnh cho đáp án
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
                <div className="mb-2 flex items-start">
                  <span className="text-sm font-medium text-primary-600 dark:text-primary-400 shrink-0 mr-2">
                    Câu {subIdx + 1}:
                  </span>
                  <span className="text-gray-900 dark:text-white whitespace-pre-wrap">
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
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mr-2">
                              <span className="font-medium text-gray-600 dark:text-gray-300">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              {Array.isArray(subQ.correctAnswers) &&
                                (subQ.correctAnswers as string[]).includes(opt) && (
                                  <span className="ml-1 text-green-600 dark:text-green-400">
                                    ✓
                                  </span>
                                )}
                            </div>
                            <span className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                              <MathText text={opt} />
                            </span>
                          </div>
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
                      <div className="mt-1">
                        {(subQ.correctAnswers as string[])
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
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Học sinh chỉ cần nhập một trong các đáp án trên
                    </p>
                  </div>
                )}

                {subQ.explanation && (
                  <div className="ml-6 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Giải thích:{" "}
                    </span>
                    <span className="text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                      <span className="whitespace-pre-line">
                        <MathText text={subQ.explanation} />
                      </span>
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

        {question.type === "drag" && (
          <div className="space-y-4 mt-4">
            {/* Kho đáp án */}
            {question.options && typeof question.options === 'object' && !Array.isArray(question.options) && (question.options as any).items && Array.isArray((question.options as any).items) && (question.options as any).items.length > 0 && (
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">
                  Kho đáp án:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {((question.options as any).items as Array<{ id: string; label: string }>).map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 flex-shrink-0"
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
                        <span className="whitespace-pre-wrap">
                          <MathText text={item.label} />
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Các nhóm đích */}
            {question.options && typeof question.options === 'object' && !Array.isArray(question.options) && (question.options as any).targets && Array.isArray((question.options as any).targets) && (question.options as any).targets.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  Các nhóm đích:
                </h3>
                {((question.options as any).targets as Array<{ id: string; label: string }>).map((target) => {
                  const correctMapping = question.correctAnswers && typeof question.correctAnswers === 'object' && !Array.isArray(question.correctAnswers)
                    ? (question.correctAnswers as Record<string, string>)
                    : {};

                  // Tìm các items thuộc target này
                  const targetItems = question.options && typeof question.options === 'object' && !Array.isArray(question.options) && (question.options as any).items
                    ? ((question.options as any).items as Array<{ id: string; label: string }>).filter(
                      (item) => correctMapping[item.id] === target.id
                    )
                    : [];

                  return (
                    <div
                      key={target.id}
                      className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20"
                    >
                      <div className="font-medium text-blue-900 dark:text-blue-300 mb-2 text-sm">
                        {target.label}
                      </div>
                      {targetItems.length > 0 ? (
                        <div className="space-y-1">
                          {targetItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-2 rounded bg-white dark:bg-gray-700 border border-green-300 dark:border-green-700 text-sm"
                            >
                              <span className="flex items-center gap-2 text-green-800 dark:text-green-300">
                                <svg
                                  className="w-4 h-4 flex-shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                <span className="whitespace-pre-wrap">
                                  <MathText text={item.label} />
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                          Chưa có đáp án được gán
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {(!question.options || typeof question.options !== 'object' || Array.isArray(question.options) ||
              !(question.options as any).items || !Array.isArray((question.options as any).items) || (question.options as any).items.length === 0) && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    Chưa có kho đáp án - Vui lòng chỉnh sửa để thêm đáp án
                  </span>
                </div>
              )}
          </div>
        )}

        {question.explanation && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
              Giải thích:
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-line">
              <MathText text={question.explanation} />
            </div>
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
    <div
      className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8"
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
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
                  <div className="flex items-center gap-2">
                    {(() => {
                      const SpinnerLoading = require("../components/SpinnerLoading").default;
                      return (
                        <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <div style={{ transform: 'scale(0.065)' }}>
                            <SpinnerLoading />
                          </div>
                        </div>
                      );
                    })()}
                    <span>Đang xuất bản...</span>
                  </div>
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
                    onImageRestore={handleImageRestoreFromDrag}
                    onImageClick={handleImageClick}
                    className="card !p-0 shadow-xl max-h-96 lg:max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden custom-thin-scrollbar"
                  />
                </div>
              </div>
            )}

            {/* Phần còn lại: Grid 2 cột cho Editor và Preview */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Cột trái - Quiz Cards - 60% */}
                <div className="lg:col-span-3">
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
                          className="btn-secondary flex items-center h-[42px]"
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
                          onClick={() => setAIGeneratorOpen(true)}
                          className="btn-primary flex items-center bg-indigo-600 hover:bg-indigo-700 ml-2 h-[42px]"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Tạo bằng AI
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
                          Bạn có thể tạo câu hỏi bằng cách bấm nút "Thêm câu hỏi" hoặc soạn trực tiếp trong "Editor"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cột phải - Editor Preview - 40% */}
                <div className="lg:col-span-2">
                  <div className="sticky top-24 h-[calc(100vh-7rem)] overflow-hidden">
                    <QuizPreview
                      questions={questions}
                      quizTitle={quizTitle}
                      onEdit={handlePreviewEdit}
                      isEditable={true}
                      onPastedImages={handlePastedImages}
                      content={previewContent}
                      onUndo={undo}
                      onRedo={redo}
                      onCursorQuestionChange={scrollToQuestionPreview}
                      onImageMoved={handleImageMoved}
                      onImageFileDropped={handleImageFileDropped}
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
                      className="btn-secondary flex items-center h-[42px]"
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
                      onClick={() => setAIGeneratorOpen(true)}
                      className="btn-primary flex items-center bg-indigo-600 hover:bg-indigo-700 h-[42px]"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Tạo bằng AI
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="btn-primary flex items-center h-[42px]"
                    >
                      {isPublishing ? (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const SpinnerLoading = require("../components/SpinnerLoading").default;
                            return (
                              <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                <div style={{ transform: 'scale(0.065)' }}>
                                  <SpinnerLoading />
                                </div>
                              </div>
                            );
                          })()}
                          <span>Đang xuất bản...</span>
                        </div>
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
                      className="btn-secondary flex items-center !bg-gray-100 !text-gray-600 hover:!bg-gray-200 dark:!bg-gray-700 dark:!text-gray-300 dark:hover:!bg-gray-600 h-[42px]"
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

      {/* Image Modal */}
      <ImageModal
        imageUrl={imageModalUrl}
        isOpen={imageModalOpen}
        onClose={handleImageModalClose}
      />
      <AIGeneratorModal
        isOpen={isAIGeneratorOpen}
        onClose={() => setAIGeneratorOpen(false)}
        onQuestionsGenerated={handleAIGenerated}
      />
    </div>
  );
};

export default EditQuizPage;
