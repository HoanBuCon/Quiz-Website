import React from 'react';
import { Question } from '../types';
import MathText from './MathText';
import { processMathInput } from '../utils/mathConverter';

interface QuizPreviewProps {
  questions: Question[];
  quizTitle?: string;
  onEdit?: (content: string) => void;
  isEditable?: boolean;
}

const QuizPreview: React.FC<QuizPreviewProps> = ({
  questions,
  quizTitle = "Preview Quiz",
  onEdit,
  isEditable = false
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


  const [editableContent, setEditableContent] = React.useState(generatePreviewText());
  const [isContentChanged, setIsContentChanged] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Cập nhật nội dung khi questions thay đổi, chỉ khi textarea không focus
  React.useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      const newContent = generatePreviewText();
      setEditableContent(newContent);
      setIsContentChanged(false);
    }
  }, [questions]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditableContent(newContent);
    setIsContentChanged(true);

    // Debounce việc gọi callback để tránh update quá nhiều
    const timeoutId = setTimeout(() => {
      if (onEdit) {
        onEdit(newContent);
      }
      setIsContentChanged(false);
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const parseEditedContent = (content: string) => {
    // Parse nội dung đã chỉnh sửa thành questions
    const lines = content.split('\n').filter(line => line.trim());
    const parsedQuestions: Question[] = [];

    let currentQuestion: Partial<Question> = {};
    let currentOptions: string[] = [];
    let currentCorrectAnswers: string[] = [];
    let isTextQuestion = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('ID:')) {
        // Lưu câu hỏi trước đó nếu có
        if (currentQuestion.question) {
          parsedQuestions.push({
            id: currentQuestion.id || `q-${Date.now()}-${Math.random()}`,
            question: currentQuestion.question,
            type: isTextQuestion ? 'text' : (currentCorrectAnswers.length > 1 ? 'multiple' : 'single'),
            options: isTextQuestion ? undefined : currentOptions,
            correctAnswers: currentCorrectAnswers,
            explanation: currentQuestion.explanation || ''
          } as Question);
        }

        // Reset cho câu hỏi mới
        currentQuestion = { id: line.replace('ID:', '').trim() };
        currentOptions = [];
        currentCorrectAnswers = [];
        isTextQuestion = false;
      } else if (line.match(/^Câu \d+:/)) {
        currentQuestion.question = line.replace(/^Câu \d+:\s*/, '');
      } else if (line.includes('Câu hỏi không có đáp án') || line.includes('Điền đáp án đúng')) {
        // Đây là câu hỏi text
        isTextQuestion = true;
      } else if (line.match(/^\*?[A-Z]\./)) {
        // Đây là đáp án
        const isCorrect = line.startsWith('*');
        const optionText = line.replace(/^\*?[A-Z]\.\s*/, '');
        currentOptions.push(optionText);

        if (isCorrect) {
          currentCorrectAnswers.push(optionText);
        }
      }
    }

    // Thêm câu hỏi cuối cùng
    if (currentQuestion.question) {
      parsedQuestions.push({
        id: currentQuestion.id || `q-${Date.now()}-${Math.random()}`,
        question: currentQuestion.question,
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
              {isEditable ? 'Chỉnh sửa trực tiếp định dạng Quiz' : 'Định dạng xuất ra File'}
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
            onChange={(e) => {
              setEditableContent(e.target.value);
              onEdit && onEdit(e.target.value);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text');

              // Process math in the pasted text (line by line to be safe?)
              // Or just process the whole chunk
              const processed = text.split('\n').map(line => processMathInput(line)).join('\n');

              // Insert processed text at cursor
              const textarea = e.target as HTMLTextAreaElement;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const currentValue = textarea.value;

              const newValue = currentValue.substring(0, start) + processed + currentValue.substring(end);

              setEditableContent(newValue);
              onEdit && onEdit(newValue);

              // Restore cursor position (approximate)
              requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + processed.length;
              });
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
              <strong>💡 Mẹo:</strong> Thay đổi ở đây sẽ tự động cập nhật cột bên trái!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizPreview;
