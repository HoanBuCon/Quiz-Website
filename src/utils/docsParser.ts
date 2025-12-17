import { parseWordFile } from "./wordParser";

export interface ParsedQuestion {
  id: string;
  question: string;
  type: "single" | "multiple" | "text" | "drag" | "composite";
  options?: string[] | { targets: any[]; items: any[]; [key: string]: any };
  correctAnswers: string[] | Record<string, string>;
  explanation?: string;
  subQuestions?: ParsedQuestion[];
}

export interface ParseResult {
  success: boolean;
  questions?: ParsedQuestion[];
  error?: string;
}

export async function parseFile(file: File): Promise<ParseResult> {
  try {
    let content: string;

    // Xử lý file Word
    if (
      file.name.toLowerCase().endsWith(".docx") ||
      file.name.toLowerCase().endsWith(".doc")
    ) {
      const wordResult = await parseWordFile(file);
      if (!wordResult.success) {
        return {
          success: false,
          error: wordResult.error || "Không thể đọc file Word",
        };
      }
      content = wordResult.content!;
    } else {
      // Xử lý file text
      content = await file.text();
    }

    // Validate format
    const validation = validateDocsFormat(content);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join("\n"),
      };
    }

    // Parse questions
    const questions = parseDocsContent(content);

    return {
      success: true,
      questions,
    };
  } catch (error) {
    console.error("Error parsing file:", error);
    return {
      success: false,
      error: `Lỗi khi xử lý file: ${
        error instanceof Error ? error.message : "Lỗi không xác định"
      }`,
    };
  }
}

// Generate unique ID
function generateId(): string {
  // Simple unique ID generator
  return `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function parseDocsContent(content: string): ParsedQuestion[] {
  // Pre-process: Normalize smart quotes and newlines
  let normalizedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes

  // Heuristic: Inject newlines before potential headers/options to handle merged lines
  // 1. Inject before "Câu <n>:" or "Câu : " if preceded by whitespace or non-newline
  // 2. Inject before "*A." (starred) even if NO whitespace (aggressive split)
  // 3. Inject before "A." (non-starred) ONLY if preceded by whitespace (avoid false positives)
  // 4. Inject before "result:", "group:", "{", "}"
  
  normalizedContent = normalizedContent
    // Inject newline trước "Câu n:"
    .replace(/([^\n])\s+(Câu\s+\d+|Câu\s*:)/gi, '$1\n$2')

    // Keywords đặc biệt
    .replace(/([^\n])\s*(result:|group:|{ |^{|}$| }|}$)/gm, '$1\n$2');

  const questions: ParsedQuestion[] = [];
  const lines = normalizedContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let currentQuestion: Partial<ParsedQuestion> = {};
  let currentOptions: string[] = [];
  let currentCorrectAnswers: string[] = []; // For Single/Multiple/Text
  
  // State for Composite (Parent/Child)
  let isCollectingComposite = false;
  let compositeBuffer: string[] = [];
  let compositeBraceCount = 0;

  const flushQuestion = () => {
    // Only flush if we have a question text
    if (currentQuestion.question) {
      // Default ID if missing
      if (!currentQuestion.id) {
        currentQuestion.id = generateId();
      }

      // Determine type if not explicitly set (e.g. by group/result parsing)
      if (!currentQuestion.type) {
        currentQuestion.type = determineQuestionType(currentCorrectAnswers);
      }

      // Construct final object
      const q: ParsedQuestion = {
        id: currentQuestion.id!,
        question: currentQuestion.question,
        type: currentQuestion.type as any,
        correctAnswers: currentCorrectAnswers.length > 0 ? currentCorrectAnswers : [],
        explanation: currentQuestion.explanation,
        subQuestions: currentQuestion.subQuestions
      };

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

      questions.push(q);
    }
    
    // Reset state
    currentQuestion = {};
    currentOptions = [];
    currentCorrectAnswers = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

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
           const subQs = parseDocsContent(compositeBuffer.join("\n"));
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
      
      const idMatch = line.match(/ID:\s*(\w+)/);
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

    // 3. Options (A. B. C. D.) — ROBUST PARSER (ES5 compatible)
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
          if (optionMatches[i].isCorrect) {
            currentCorrectAnswers.push(content);
          }
        }
      }
      continue;
    }

    // 4. Fill-in / Drag Result (result: ...)
    if (line.startsWith("result:")) {
      const content = line.substring(7).trim();
      
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
           currentCorrectAnswers.push(content);
           currentQuestion.type = 'text';
        }
      } else {
        // Simple text result
        currentCorrectAnswers.push(content);
        currentQuestion.type = 'text';
      }
      continue;
    }

    // 5. Group Definition (group: ...)
    if (line.startsWith("group:")) {
      const content = line.substring(6).trim();
      
      const targets: any[] = [];
      const mapping: Record<string, string> = {}; 

      // Improved Regex: handles quotes inside keys/values better 
      // \("([^"]+)"\s*:\s*(\[[^\]]+\])\)
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

  return questions;
}

function determineQuestionType(
  correctAnswers: string[]
): "single" | "multiple" | "text" {
  if (correctAnswers.length === 0) {
    return "text"; // Mặc định là text nếu không có đáp án đúng (hoặc điền khuyết)
  } else if (correctAnswers.length === 1) {
    return "single";
  } else {
    return "multiple";
  }
}

export function validateDocsFormat(content: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let hasValidQuestion = false;
  let totalLines = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("ID:")) {
        // found ID
    } else if (line.match(/^Câu\s+\d+|Câu\s*:/i) || (line.startsWith("Câu") && line.includes(":"))) {
      hasValidQuestion = true;
    }
  }

  // Relaxed validation
  if (!hasValidQuestion && totalLines > 0) {
    errors.push(
      `Không tìm thấy câu hỏi hợp lệ (thiếu dòng bắt đầu bằng "Câu n:"). File có ${totalLines} dòng.`
    );
  } else if (totalLines === 0) {
      errors.push("File trống.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
