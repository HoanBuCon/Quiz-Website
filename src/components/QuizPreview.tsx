import React, { useRef, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Question } from '../types';
import MathText from './MathText';
import { processMathInput } from '../utils/mathConverter';

interface QuizPreviewProps {
  questions: Question[];
  quizTitle?: string;
  onEdit?: (content: string) => void;
  isEditable?: boolean;
  onPastedImages?: (images: Record<string, string>) => void;
  content?: string;
  onUndo?: () => void;
  onRedo?: () => void;
}

const QuizPreview: React.FC<QuizPreviewProps> = ({
  questions,
  quizTitle = "Preview Quiz",
  onEdit,
  isEditable = false,
  onPastedImages,
  content,
  onUndo,
  onRedo
}) => {
  // Chuyển đổi questions thành format text để hiển thị
  // SỬ DỤNG FORMAT MỚI CỦA docsParser
  const generatePreviewText = () => {
    let content = '';

    questions.forEach((q, index) => {
      content += `ID: ${q.id}\n`;
      content += `Câu ${index + 1}: ${q.question}\n`;
      // Hiển thị marker nếu có ảnh câu hỏi
      if ((q as any).questionImage) {
        content += `<hình ảnh>\n`;
      }

      if (q.type === 'text') {
        // Format: result: <answer>
        const answers = Array.isArray(q.correctAnswers)
          ? (q.correctAnswers as string[]).filter((a) => a.trim())
          : [];
        if (answers.length > 0) {
          content += `result: ${answers[0]}\n`;
        }
      } else if (q.type === 'composite') {
        // Format: { ... sub-questions ... }
        content += `{\n`;
        if (q.subQuestions && q.subQuestions.length > 0) {
          q.subQuestions.forEach((subQ, subIdx) => {
            content += `Câu ${subIdx + 1}: ${subQ.question}\n`;
            if ((subQ as any).questionImage) {
              content += `<hình ảnh>\n`;
            }
            if (subQ.type === 'text') {
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
                const prefix = isCorrect ? '*' : '';
                const letter = String.fromCharCode(65 + optIdx);
                content += `${prefix}${letter}. ${opt}\n`;
                if ((subQ as any).optionImages && (subQ as any).optionImages[opt]) {
                  content += `<hình ảnh>\n`;
                }
              });
            }

            // Add blank line between sub-questions
            if (subIdx < q.subQuestions!.length - 1) {
              content += '\n';
            }
          });
        }
        content += `}\n`;
      } else if (q.type === 'drag') {
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
            content += `group: ${groupParts.join(', ')}\n`;
          }
        }
      } else {
        // Single/Multiple choice: *A. B. *C. D.
        if (Array.isArray(q.options)) {
          q.options.forEach((option, optIndex) => {
            const isCorrect = Array.isArray(q.correctAnswers) && q.correctAnswers.includes(option);
            const prefix = isCorrect ? '*' : '';
            const letter = String.fromCharCode(65 + optIndex); // A, B, C, D...
            content += `${prefix}${letter}. ${option}\n`;
            if ((q as any).optionImages && (q as any).optionImages[option]) {
              content += `<hình ảnh>\n`;
            }
          });
        }
      }

      if (index < questions.length - 1) {
        content += '\n';
      }
    });

    return content;
  };


  // Check if content is controlled by parent (EditQuizPage)
  const isContentControlled = content !== undefined;

  const [editableContent, setEditableContent] = React.useState(
    isContentControlled ? content : generatePreviewText()
  );
  const [isContentChanged, setIsContentChanged] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Ref to store cursor position for restoration
  const cursorRef = React.useRef<{ start: number; end: number } | null>(null);

  // Ref to track last content submitted to parent to avoid "stale echo" updates
  // Initialize with content so we don't ignore initial props if they match
  const lastSubmittedContentRef = React.useRef<string | undefined>(content);

  // Sync internal state with prop content if provided
  useEffect(() => {
    if (isContentControlled && content !== undefined && content !== editableContent) {

      // STALE ECHO CHECK:
      // If the content coming from parent matches what we just sent, 
      // AND we are currently editing (implied by content !== editableContent, meaning we moved ahead),
      // then this is a "Stale Echo" (Parent confirming 'A', but we are at 'AB').
      // We should IGNORE it to preserve our local changes.
      if (content === lastSubmittedContentRef.current) {
        return;
      }

      // Save cursor position if user is typing (focused)
      if (textareaRef.current && document.activeElement === textareaRef.current) {
        cursorRef.current = {
          start: textareaRef.current.selectionStart,
          end: textareaRef.current.selectionEnd,
        };
      }

      setEditableContent(content);
      // Stop "Updating..." indicator when content arrives from parent (e.g. after Undo)
      setIsContentChanged(false);
    }
  }, [content, isContentControlled]);

  // Restore cursor position after update
  React.useLayoutEffect(() => {
    if (cursorRef.current && textareaRef.current) {
      textareaRef.current.setSelectionRange(cursorRef.current.start, cursorRef.current.end);
      cursorRef.current = null;
    }
  }, [editableContent]);
  // Removed editableContent from dependency to avoid loop, though logic suggests we need it for comparison. 
  // Actually, 'editableContent' as dependency could trigger effect on local change, overriding it back to old content? 
  // No, if local change -> editableContent updates. if content prop hasn't changed, content != editableContent is TRUE.
  // Wait. Parent passes 'content'. User types 'contentA'. editableContent='contentA'.
  // Parent hasn't updated 'content' yet (debounce).
  // If we run this effect, content (old) != editableContent (new).
  // We would revert user typing!

  // FIX: We need to know if the update comes from PARENT due to external change, or internal.
  // The original code was: setEditableContent(content).
  // This meant EVERY time parent re-renders (even passing same content), we reset.
  // React usually bails out on same value state update.
  // But if parent passes new reference or we just set it blindly?

  // The issue is likely:
  // 1. User types 'A'. onChange -> update prop via callback (debounced).
  // 2. Parent state updates to 'A'. Parent re-renders. Passes 'A' back to QuizPreview.
  // 3. QuizPreview effect runs. Calls setEditableContent('A').
  // 4. React might re-render textarea.

  // Solution: If content === editableContent, DO NOT call setEditableContent.
  // React's functional update bail-out might not be enough if something else triggers render.
  // But explicitly checking `content !== editableContent` helps.

  // Also, we have a race condition with Debounce.
  // User types 'A'. Local: 'A'. Prop: '' (not yet updated).
  // If this effect runs now, it reverts 'A' to ''.
  // We need to avoid syncing IF we are the ones who caused the change (via typing).

  // But 'content' prop is usually the Source of Truth in Controlled mode.
  // Standard pattern:
  // 1. Local state tracks input.
  // 2. On Change -> Update local, notify parent.
  // 3. Parent updates prop.
  // 4. Effect syncs prop -> local.

  // If step 4 happens, it risks cursor jump.
  // But we need step 4 for Undo/Redo or external changes.

  // REFINED FIX:
  // Only sync if content differs significantly? No.
  // Check if document.activeElement is the textarea?
  // If user is focusing the textarea, we generally TRUST local state, UNLESS the prop change is radical (e.g. Undo).

  // Let's stick to the Plan: Check for inequality.
  // And maybe removing `useEffect` dependencies issues?
  // Let's implement the inequality check first.

  // Fallback: Cập nhật nội dung khi questions thay đổi, CHỈ KHI content KHÔNG được control bởi parent
  // IMPORTANT: Nếu EditQuizPage đang control content (isContentControlled = true), 
  // KHÔNG được gọi generatePreviewText() vì sẽ ghi đè [IMAGE:id] tags bằng <hình ảnh> placeholders
  React.useEffect(() => {
    if (!isContentControlled && document.activeElement !== textareaRef.current) {
      const newContent = generatePreviewText();
      setEditableContent(newContent);
      setIsContentChanged(false);
    }
  }, [questions, isContentControlled]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Helper to trigger update with debounce and loading state
  const updateContentWithDebounce = (newContent: string) => {
    setEditableContent(newContent);
    setIsContentChanged(true);

    // Xóa timeout cũ nếu có
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce việc gọi callback để tránh update quá nhiều
    timeoutRef.current = setTimeout(() => {
      if (onEdit) {
        lastSubmittedContentRef.current = newContent; // Mark as submitted
        onEdit(newContent);
      }
      setIsContentChanged(false);
      timeoutRef.current = null;
    }, 500);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    updateContentWithDebounce(newContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      // Show "Updating..." state immediately for visual feedback
      setIsContentChanged(true);
      if (e.shiftKey) {
        onRedo && onRedo();
      } else {
        onUndo && onUndo();
      }
    }
  };




  const parseEditedContent = (content: string) => {
    // Parse nội dung đã chỉnh sửa thành questions
    const lines = content.split('\n');
    const parsedQuestions: Question[] = [];

    let currentQuestion: Partial<Question> = {};
    let currentOptions: string[] = [];
    let currentCorrectAnswers: string[] = [];
    let isTextQuestion = false;

    // State để theo dõi đang parse ở phần nào: 'none' | 'question' | 'option' | 'explanation'
    let currentSection: 'none' | 'question' | 'option' | 'explanation' = 'none';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; // Giữ nguyên khoảng trắng đầu dòng nếu cần, hoặc trim nếu muốn thống nhất
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('ID:')) {
        // 1. Lưu câu hỏi cũ nếu có
        if (currentQuestion.question) {
          parsedQuestions.push({
            id: currentQuestion.id || `q-${Date.now()}-${Math.random()}`,
            question: currentQuestion.question.trim(), // Trim final result
            type: isTextQuestion ? 'text' : (currentCorrectAnswers.length > 1 ? 'multiple' : 'single'),
            options: isTextQuestion ? undefined : currentOptions,
            correctAnswers: currentCorrectAnswers,
            explanation: currentQuestion.explanation || ''
          } as Question);
        }

        // 2. Reset cho câu mới
        currentQuestion = { id: trimmedLine.replace('ID:', '').trim() };
        currentOptions = [];
        currentCorrectAnswers = [];
        isTextQuestion = false;
        currentSection = 'none';

      } else if (trimmedLine.match(/^Câu \d+:/)) {
        // Bắt đầu câu hỏi
        currentQuestion.question = trimmedLine.replace(/^Câu \d+:\s*/, '');
        currentSection = 'question';

      } else if (trimmedLine.includes('Câu hỏi không có đáp án') || trimmedLine.includes('Điền đáp án đúng') || trimmedLine.startsWith('result:')) {
        // Marker cho text question
        isTextQuestion = true;
        // Nếu dòng này có chứa nội dung (ví dụ result: answer), ta có thể parse luôn nếu cần,
        // nhưng logic cũ có vẻ chỉ dùng để đánh dấu type.
        // Tạm thời giữ logic cũ hoặc điều chỉnh nếu cần. 
        // Logic generatePreviewText dùng "result: ...", nên ở đây nếu gặp "result:" thì cũng là marker.
        if (trimmedLine.startsWith('result:')) {
          const ans = trimmedLine.replace('result:', '').trim();
          if (ans) {
            currentCorrectAnswers.push(ans);
          }
        }
        currentSection = 'none'; // Stop appending to question

      } else if (trimmedLine.match(/^\*?[A-Z]\./)) {
        // Bắt đầu một option mới
        const isCorrect = trimmedLine.startsWith('*');
        const optionText = trimmedLine.replace(/^\*?[A-Z]\.\s*/, '');

        currentOptions.push(optionText);
        if (isCorrect) {
          currentCorrectAnswers.push(optionText);
        }
        currentSection = 'option';

      } else if (trimmedLine === '{') {
        // Composite start - logic hiện tại chưa support composite multiline deep editing phức tạp ở đây 
        //(logic cũ cũng chưa thấy handle sâu composite trong parseEditedContent ngoài việc hiển thị).
        // Tạm thời nếu gặp composite block thì ta reset section
        currentSection = 'none';
      } else {
        // Dòng bình thường (không phải marker) -> Append vào section đang active
        if (trimmedLine === '') {
          // Dòng trống: Nếu đang ở question, có thể muốn giữ hoặc không.
          // Nếu user gõ xuống dòng 2 lần, muốn hiển thị 2 dòng?
          // HTML thường không hiển thị nhiều dòng trống trừ khi dùng <br> hoặc pre-wrap.
          // Với pre-wrap, \n là đủ.
          if (currentSection !== 'none') {
            if (currentSection === 'question' && currentQuestion.question) {
              currentQuestion.question += '\n';
            } else if (currentSection === 'option' && currentOptions.length > 0) {
              currentOptions[currentOptions.length - 1] += '\n';
            }
          }
        } else {
          // Có nội dung
          if (currentSection === 'question') {
            if (currentQuestion.question) {
              currentQuestion.question += '\n' + trimmedLine;
            } else {
              currentQuestion.question = trimmedLine;
            }
          } else if (currentSection === 'option') {
            if (currentOptions.length > 0) {
              // Append vào option cuối cùng
              // Update cả trong currentCorrectAnswers nếu nó là đáp án đúng?
              // Rất KHÓ vì currentCorrectAnswers lưu string value.
              // Cách tốt nhất: Sửa trực tiếp trong currentOptions, sau đó CẬP NHẬT lại currentCorrectAnswers
              // bằng cách check lại logic (nhưng ta đã push vào correctAnswers lúc tạo option rồi).

              // Fix: Ta cần track index của option đang edit.
              const lastOptIdx = currentOptions.length - 1;
              const oldVal = currentOptions[lastOptIdx];
              const newVal = oldVal + '\n' + trimmedLine;
              currentOptions[lastOptIdx] = newVal;

              // Nếu option này là correct, ta cũng phải update trong correctAnswers
              // Vì correctAnswers là mảng string values (không phải index), nên ta phải tìm và update.
              // Tuy nhiên, nếu có 2 option nội dung giống hệt nhau (ít gặp), sẽ bug.
              // Nhưng text editor flow thường tuyến tính.

              // Check xem lúc nãy ta có push vào correctAnswers không?
              // Logic: "Nếu dòng bắt đầu bằng *, push vào correctAnswers".
              // Vậy nếu ta đang append vào option vừa tạo, và option đó là correct,
              // thì cái entry CUỐI CÙNG trong correctAnswers chính là nó (nếu flow tuần tự).
              // Rủi ro: Nếu user definition A, B, C... thì A là options[0].
              // Nếu A đúng, correctAnswers[0] = A.
              // Sau đó parse B. options[1] = B.
              // Sau đó parse Line tiếp theo (thuộc B). B += line.
              // Nếu B đúng, correctAnswers có B. Ta update B trong options, cũng phải update B trong correctAnswers.

              // Cách đơn giản: Re-sync correct answers ở bước cuối (Save câu hỏi) 
              // hoặc dùng cơ chế đánh dấu index nào là correct thay vì push value ngay lập tức.
              // NHƯNG để an toàn và ít sửa đổi struct: 
              // Ta sẽ kiểm tra: Nếu dòng gốc (line bắt đầu bằng *) có *, thì option này là correct.
              // Ta update value trong currentOptions.
              // Cuối cùng, khi push câu hỏi, ta sẽ rebuild correctAnswers dựa trên marking?
              // Không, text input không giữ state "option index 0 is correct". Nó chỉ có text "*A. Content".

              // GIẢI PHÁP: 
              // Khi append vào option, ta update array currentOptions.
              // Đồng thời check xem option này (currentOptions[length-1]) CÓ ĐANG nằm trong currentCorrectAnswers không?
              // Vấn đề: `oldVal` có thể trùng với option khác.
              // Tạm chấp nhận: Update entry tương ứng trong correctAnswers.

              const foundIdx = currentCorrectAnswers.indexOf(oldVal);
              if (foundIdx !== -1) {
                currentCorrectAnswers[foundIdx] = newVal;
              }
            }
          }
        }
      }
    }

    // Lưu câu cuối
    if (currentQuestion.question) {
      parsedQuestions.push({
        id: currentQuestion.id || `q-${Date.now()}-${Math.random()}`,
        question: currentQuestion.question.trim(),
        type: isTextQuestion ? 'text' : (currentCorrectAnswers.length > 1 ? 'multiple' : 'single'),
        options: isTextQuestion ? undefined : currentOptions,
        correctAnswers: currentCorrectAnswers,
        explanation: currentQuestion.explanation || ''
      } as Question);
    }

    return parsedQuestions;
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Trình chỉnh sửa
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isEditable ? 'Chỉnh sửa trực tiếp nội dung Quiz' : 'Nội dung xuất ra File'}
            </p>
          </div>
          {isContentChanged && (
            <div className="flex items-center text-sm text-orange-600 dark:text-orange-400">
              <svg className="w-4 h-4 mr-1 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Đang cập nhật...
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {isEditable ? (
          <textarea
            ref={textareaRef}
            value={editableContent}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              e.preventDefault();

              // 1. Handle Images (File/Blob)
              const items = e.clipboardData.items;
              const images: Record<string, string> = {};
              let hasImages = false;

              // Helper: Insert text at cursor
              const insertText = (text: string) => {
                const textarea = e.target as HTMLTextAreaElement;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const currentValue = textarea.value;

                const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);

                // Use the helper to trigger debounce and "Updating..." state
                updateContentWithDebounce(newValue);

                requestAnimationFrame(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + text.length;
                });
              };

              // 2. Handle Text/HTML (Complex Word Paste)
              const html = e.clipboardData.getData('text/html');
              const plainText = e.clipboardData.getData('text');

              if (html || plainText) {
                const processedText = plainText ? plainText.split('\n').map(line => processMathInput(line)).join('\n') : "";

                // Check for image items (Files)
                const imageCodes: string[] = [];
                const promises: Promise<void>[] = [];
                let foundItems = false;

                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    foundItems = true;
                    hasImages = true;
                    const blob = items[i].getAsFile();
                    if (blob) {
                      const p = new Promise<void>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const base64 = event.target?.result as string;
                          const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                          images[id] = base64;
                          imageCodes.push(`[IMAGE:${id}]`);
                          resolve();
                        };
                        reader.readAsDataURL(blob);
                      });
                      promises.push(p);
                    }
                  }
                }

                // If no file items found, try to extract base64 from HTML (Word Mixed Content)
                if (!foundItems && html) {
                  // Regex to detect ANY img tag
                  const imgTagRegex = /<img\s+/i;
                  // Regex to capture src
                  const srcRegex = /src\s*=\s*['"]?([^'"]+)['"]?/i;

                  // Detect Word-specific HTML signatures
                  const isWordContent = html.indexOf('urn:schemas-microsoft-com-com:office:word') !== -1 || html.indexOf('xmlns:w=') !== -1;

                  let hasLocalFiles = false;

                  // Match global img tags manually to handle diverse attributes
                  const matches = html.match(/<img\s+[^>]*>/gi);
                  if (matches) {
                    for (const imgTag of matches) {
                      const srcMatch = srcRegex.exec(imgTag);
                      const src = srcMatch ? srcMatch[1] : '';

                      if (src.startsWith('data:image/')) {
                        hasImages = true;
                        const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                        images[id] = src;
                        imageCodes.push(`[IMAGE:${id}]`);
                      } else if (src.startsWith('file://') || src.indexOf('/') === -1 || src.indexOf('word/media') !== -1) {
                        // Local file or relative word path
                        hasLocalFiles = true;
                      }
                    }
                  }

                  // If we found NO usable images, but we detected local files OR it's Word content with images...
                  if (!hasImages && (hasLocalFiles || (isWordContent && matches && matches.length > 0))) {
                    toast.error("Không thể nhận ảnh trực tiếp từ file Word (bảo mật trình duyệt chặn 'file://'). Vui lòng dùng chức năng 'Tải file Word' hoặc copy từng ảnh (Screenshot).");
                  }
                }

                if (hasImages || foundItems) {
                  Promise.all(promises).then(() => {
                    onPastedImages && onPastedImages(images);
                    // Insert text + image codes
                    const finalContent = processedText + (processedText && imageCodes.length > 0 ? '\n' : '') + imageCodes.join('\n');
                    insertText(finalContent);
                  });
                  return;
                } else {
                  // Just text processing
                  insertText(processedText);
                  return;
                }
              }

              // 3. Fallback: Pure Image Paste (e.g. Screenshot) or Pure Text
              // Check loop again if we didn't match HTML branch
              const imageCodes: string[] = [];
              const promises: Promise<void>[] = [];

              for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                  hasImages = true;
                  const blob = items[i].getAsFile();
                  if (blob) {
                    const p = new Promise<void>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                        images[id] = base64;
                        imageCodes.push(`[IMAGE:${id}]`);
                        resolve();
                      };
                      reader.readAsDataURL(blob);
                    });
                    promises.push(p);
                  }
                }
              }

              if (hasImages) {
                Promise.all(promises).then(() => {
                  onPastedImages && onPastedImages(images);
                  insertText(imageCodes.join('\n'));
                });
              } else {
                // Standard text paste with math processing
                const text = e.clipboardData.getData('text');
                const processed = text.split('\n').map(line => processMathInput(line)).join('\n');
                insertText(processed);
              }
            }}
            className="w-full h-full min-h-[600px] p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white font-mono text-sm resize-none custom-scrollbar"
            placeholder="Chỉnh sửa nội dung file..."
          />
        ) : (
          <div className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words custom-scrollbar overflow-auto">
            <MathText text={editableContent} />
          </div>
        )}
      </div>

      {/* Footer với hướng dẫn */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <div><strong className="text-gray-800 dark:text-gray-200">Hướng dẫn định dạng:</strong></div>
          <div>• <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">*A.</code> = đáp án đúng, nhiều <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">*</code> = chọn nhiều</div>
          <div>• <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">result: text</code> = câu hỏi điền khuyết</div>
          <div>• <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">result: [...]</code> + <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">group: (...)</code> = kéo thả phân loại</div>
          <div>• <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">{'{ ... }'}</code> = câu hỏi mẹ chứa câu con</div>
          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border-l-4 border-blue-400 dark:border-blue-500">
            <div className="text-blue-700 dark:text-blue-200">
              <strong>💡 Mẹo:</strong> Thay đổi ở đây sẽ tự động cập nhật nội dung Quiz bên trái!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizPreview;
