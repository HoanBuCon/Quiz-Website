import { parseWordFile } from "./wordParser";

export interface ParsedQuestion {
  id: string;
  question: string;
  type: "single" | "multiple" | "text" | "drag" | "composite";
  options?: string[] | { targets: any[]; items: any[]; [key: string]: any };
  correctAnswers: string[] | Record<string, string>;
  explanation?: string;
  subQuestions?: ParsedQuestion[];
  questionImage?: string;
  questionImageId?: string; // Added to support tracking
  optionImages?: Record<string, string>;
  optionImageIds?: Record<string, string>; // Added to support tracking
}

export interface ParseResult {
  success: boolean;
  questions?: ParsedQuestion[];
  images?: import('../types').ExtractedImage[];
  textContent?: string; // For image mapping
  error?: string;
}

export async function parseFile(file: File): Promise<ParseResult> {
  try {
    let content: string;
    let images: import('../types').ExtractedImage[] | undefined;

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
      images = wordResult.images;
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

    // Parse questions - PASS images array to parser
    const questions = parseDocsContent(content, images);

    // FIX: Filter out images that have been assigned to questions/options
    // Collect all assigned image IDs from parsed questions
    const assignedImageIds = new Set<string>();
    
    questions.forEach(q => {
      // Question images
      if (q.questionImageId) {
        assignedImageIds.add(q.questionImageId);
      }
      
      // Option images
      if (q.optionImageIds) {
        Object.values(q.optionImageIds).forEach(id => {
          if (id) assignedImageIds.add(id);
        });
      }
      
      // Sub-questions (for composite type)
      if (q.subQuestions) {
        q.subQuestions.forEach(subQ => {
          if (subQ.questionImageId) {
            assignedImageIds.add(subQ.questionImageId);
          }
          if (subQ.optionImageIds) {
            Object.values(subQ.optionImageIds).forEach(id => {
              if (id) assignedImageIds.add(id);
            });
          }
        });
      }
    });

    // Filter images to only include unassigned ones
    const unassignedImages = images?.filter(img => !assignedImageIds.has(img.id));

    return {
      success: true,
      questions,
      images: unassignedImages,
      textContent: content, // For image mapping
    };
  } catch (error) {
    // console.error("Error parsing file:", error);
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

/**
 * Helper function to protect LaTeX and mathematical expressions before text normalization
 * Extracts LaTeX/math content and replaces it with placeholders
 * This prevents LaTeX braces from being split during normalization
 * CRITICAL: Preserves original format, does NOT normalize
 */
function protectLatexExpressions(text: string): { text: string; protectedExpressions: string[] } {
  const protectedExpressions: string[] = [];
  let result = text;

  // Protect display math $$...$$
  result = result.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const index = protectedExpressions.length;
    // CRITICAL: Keep original format, only replace newlines with spaces for protection
    protectedExpressions.push(match.replace(/\n/g, ' '));
    return `__LATEX_PROTECTED_${index}__`;
  });

  // Protect inline math $...$
  result = result.replace(/\$[^$\n]+\$/g, (match) => {
    const index = protectedExpressions.length;
    // CRITICAL: Keep original format
    protectedExpressions.push(match.replace(/\n/g, ' '));
    return `__LATEX_PROTECTED_${index}__`;
  });

  // Helper to check if a brace group is part of a composite block
  // Composite blocks typically start with { followed by "Câu" or whitespace + "Câu"
  const isCompositeBlockStart = (text: string, braceIndex: number): boolean => {
    // Check if this is a standalone { at start of line or after whitespace
    const beforeBrace = text.substring(Math.max(0, braceIndex - 50), braceIndex).trim();
    const afterBrace = text.substring(braceIndex + 1, Math.min(text.length, braceIndex + 20)).trim();
    
    // If { is at start of line or after newline/whitespace, and followed by "Câu", it's composite
    if (beforeBrace === '' || beforeBrace.endsWith('\n')) {
      if (afterBrace.match(/^\s*Câu\s*\d*:?/i)) {
        return true;
      }
    }
    
    // If { is preceded by whitespace and followed by "Câu", it's composite
    if (beforeBrace.match(/\s$/) && afterBrace.match(/^\s*Câu\s*\d*:?/i)) {
      return true;
    }
    
    return false;
  };

  // Protect ALL mathematical expressions with braces (not just LaTeX commands)
  // This includes: s^{2}, x_{i}, \overline{x\vphantom{b}}, etc.
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
          // Skip escaped characters
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
        
        // Only protect if it looks like a mathematical expression
        // (contains numbers, math operators, LaTeX commands, or is part of a larger math context)
        const beforeExpr = result.substring(Math.max(0, braceStart - 10), braceStart);
        const afterExpr = result.substring(braceEnd, Math.min(result.length, braceEnd + 10));
        
        // Check if this is likely a math expression:
        // - Contains LaTeX commands (backslash)
        // - Contains numbers or math operators
        // - Preceded by math operators, letters, or LaTeX commands
        // - Followed by math operators, letters, or LaTeX commands
        const isMathExpr = 
          mathExpr.includes('\\') || // Contains LaTeX
          /[0-9+\-*/^_=<>]/.test(mathExpr) || // Contains numbers or operators
          /[a-zA-Z0-9_^]/.test(beforeExpr.slice(-1)) || // Preceded by letter/number
          /[a-zA-Z0-9_^=]/.test(afterExpr.charAt(0)); // Followed by letter/number/operator
        
        if (isMathExpr) {
          const index = protectedExpressions.length;
          // CRITICAL: Keep original format, only replace newlines with spaces for protection
          protectedExpressions.push(mathExpr.replace(/\n/g, ' '));
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
}

/**
 * Helper function to restore protected LaTeX expressions
 */
function restoreLatexExpressions(text: string, protectedExpressions: string[]): string {
  let result = text;
  protectedExpressions.forEach((latex, index) => {
    result = result.replace(`__LATEX_PROTECTED_${index}__`, latex);
  });
  return result;
}

export function parseDocsContent(
  content: string,
  extractedImages?: import('../types').ExtractedImage[]
): ParsedQuestion[] {
  // Pre-process: Normalize smart quotes and newlines
  let normalizedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes

  // CRITICAL: Protect LaTeX expressions BEFORE normalization to prevent breaking LaTeX braces
  const { text: protectedText, protectedExpressions: latexExpressions } = protectLatexExpressions(normalizedContent);

  // Heuristic: Inject newlines before potential headers/options to handle merged lines
  // 1. Inject before "Câu <n>:" or "Câu : " if preceded by whitespace or non-newline
  // 2. Inject before "*A." (starred) even if NO whitespace (aggressive split)
  // 3. Inject before "A." (non-starred) ONLY if preceded by whitespace (avoid false positives)
  // 4. Inject before "result:", "group:", "{", "}"
  
  normalizedContent = protectedText
    // Inject newline trước "Câu n:"
    .replace(/([^\n])\s+(Câu\s+\d+|Câu\s*:)/gi, '$1\n$2')

    // FIX: Tách ngoặc nhọn ra dòng riêng để nhận diện composite block
    // CRITICAL: Must split { and } to separate lines to properly detect composite blocks
    // Split content before { and put { on new line (but not LaTeX commands)
    .replace(/([^\n\s\\])\s*\{/g, '$1\n{')
    // Split content after { onto next line (but preserve LaTeX braces)
    // Only split if { is not part of LaTeX command (no backslash before it)
    .replace(/([^\\])\{([^\n\s])/g, '$1{\n$2')
    // Handle { at start of line (must be on its own line)
    .replace(/^\s*\{([^\n\s])/gm, '{\n$1')
    // Split content before } onto previous line (but preserve LaTeX braces)
    // CRITICAL: Must split } BEFORE result: to ensure result: is inside composite block
    .replace(/([^\n\s])\s*\}([^\\])/g, '$1\n}$2')
    // Split } from content after it (must be on its own line)
    // CRITICAL: This must come BEFORE result: normalization
    .replace(/\}([^\n\s])/g, '}\n$1')

    // Keywords đặc biệt (result:, group:)
    // FIX: Ensure result: and group: are always on their own line
    // CRITICAL: Must split result: BEFORE normalizing braces, and ensure it's on its own line
    // First, handle specific patterns (Câu, Options) to avoid conflicts
    .replace(/(Câu\s+\d+:\s*[^\n]+?)\s*(result:|group:)/gi, '$1\n$2')
    .replace(/([A-Z]\.\s*[^\n]+?)\s*(result:|group:)/g, '$1\n$2')
    // Then handle punctuation followed by result: (no space)
    .replace(/([?!.])(result:|group:)/gi, '$1\n$2')
    // Finally, handle general case: any character followed by result: (with or without space)
    // CRITICAL: This must come AFTER brace normalization to avoid conflicts
    .replace(/([^\n])(\s*)(result:|group:)/gm, '$1\n$3')
    
    // Remove image placeholder tags
    .replace(/<hình ảnh>/g, "");
  
  // FIX: Normalize LaTeX braces - remove whitespace/newlines inside braces
  // This fixes {n } → {n} and {n\n} → {n}
  // NOTE: This only affects structural braces, LaTeX is already protected
  normalizedContent = normalizedContent.replace(/\{\s+/g, '{');
  normalizedContent = normalizedContent.replace(/\s+\}/g, '}');
  
  // CRITICAL: Restore LaTeX expressions AFTER normalization
  normalizedContent = restoreLatexExpressions(normalizedContent, latexExpressions);

  const questions: ParsedQuestion[] = [];
  const lines = normalizedContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
    // .filter((line) => line !== '[IMAGE]'); // Do NOT filter image markers now, we need them

  // Helper to find image data by ID from extractedImages array
  const findImageData = (imageId: string): string | undefined => {
    if (!extractedImages) return undefined;
    const img = extractedImages.find(img => img.id === imageId);
    return img?.data;
  };

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
        currentQuestion.type = determineQuestionType(currentCorrectAnswers, currentOptions);
      }

      // Construct final object
      const q: ParsedQuestion = {
        id: currentQuestion.id!,
        question: currentQuestion.question,
        type: currentQuestion.type as any,
        correctAnswers: currentCorrectAnswers.length > 0 ? currentCorrectAnswers : [],
        explanation: currentQuestion.explanation,
        subQuestions: currentQuestion.subQuestions,
        questionImage: currentQuestion.questionImage,
        questionImageId: currentQuestion.questionImageId,
        optionImages: currentQuestion.optionImages,
        optionImageIds: currentQuestion.optionImageIds
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

  // Helper function to count braces while ignoring LaTeX commands
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- COMPOSITE BLOCK HANDLING ---
    if (isCollectingComposite) {
      // CRITICAL: Count braces while ignoring LaTeX to avoid false closing
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
           const subQs = parseDocsContent(compositeBuffer.join("\n"), extractedImages);
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

    // 3. Options (A. B. C. D.) — ROBUST PARSER (ES5 compatible)
    // Updated regex to handle potentially weird spacing or chars before the option letter
    // Also captures `1.` if numbered lists are used (uncommon but possible fallback)
    const optionRegex = /(?:^|\s)([*]?)([A-Z])\.\s*/g;
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
      // Extract text for each matched option
      for (let i = 0; i < optionMatches.length; i++) {
        const m = optionMatches[i];
        const nextMatch = optionMatches[i + 1];
        const endIndex = nextMatch ? nextMatch.index : line.length;
        // Clean newlines from option text to prevent LaTeX breaking
        const content = line.substring(m.index + m.length, endIndex).trim().replace(/\n/g, ' ');

        if (content.length > 0) {
          currentOptions.push(content);
          if (optionMatches[i].isCorrect) {
            currentCorrectAnswers.push(content);
          }
        }
      }
      continue;
    }

    // NEW: Image Marker Support [IMAGE:id]
    // Matches: [IMAGE:img-1234] - Allow optional whitespace around
    const imgMarkerMatch = line.match(/^\s*\[IMAGE:([^\]]+)\]\s*$/);
    if (imgMarkerMatch) {
      const imgId = imgMarkerMatch[1];
      // FIX: Lookup actual image data from extractedImages array
      const imgData = findImageData(imgId);
      
      // Determine where to attach this image
      if (currentOptions.length > 0) {
        // Attach to the last option
        const lastOptionIndex = currentOptions.length - 1;
        const lastOptionText = currentOptions[lastOptionIndex];
        
        if (!currentQuestion.optionImages) currentQuestion.optionImages = {};
        if (!currentQuestion.optionImageIds) currentQuestion.optionImageIds = {};
        
        // FIX: Assign BOTH ID and DATA
        currentQuestion.optionImageIds[lastOptionText] = imgId;
        if (imgData) {
          currentQuestion.optionImages[lastOptionText] = imgData;
        }

      } else {
        // Attach to question
        // FIX: Assign BOTH ID and DATA
        currentQuestion.questionImageId = imgId;
        if (imgData) {
          currentQuestion.questionImage = imgData;
        }
      }
      continue;
    }

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
      if (line === "{" || line === "}") return true;
      // 5. Options (*A., A.)
      if (line.match(/^[*]?\s*[A-Z]\.\s*/)) return true;
      
      return false;
    };

    // Helper to accumulate multi-line content
    const accumulateLines = (startIdx: number): { content: string, nextIdx: number } => {
      // CRITICAL: Match result: or group: with optional whitespace before colon
      let content = lines[startIdx].replace(/^(result|group)\s*:/i, '').trim();
      let nextIdx = startIdx + 1;
      
      while (nextIdx < lines.length) {
        const nextLine = lines[nextIdx];
        if (isNewBlock(nextLine)) {
          break;
        }
        content += " " + nextLine; // Join with space (or newline if needed, but space usually allows JSON parsing)
        nextIdx++;
      }
      
      // Return adjusted index (loop will increment, so return nextIdx - 1)
      return { content: content.trim(), nextIdx: nextIdx - 1 };
    };

    // 4. Fill-in / Drag Result (case-insensitive & multi-line)
    const resultMatch = line.match(/^result\s*:/i);
    if (resultMatch) {
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
           // console.warn("Failed to parse result array", e);
           // Fallback to text
           currentCorrectAnswers = [content];
           currentQuestion.type = 'text';
        }
      } 
      // Check for quoted multiple answers: "A", "B" (Comma separated quoted strings)
      else if (content.includes('"')) {
        // Regex to find all "quoted parts"
        // This handles "A", "B" and "A" cleanly.
        const matches = content.match(/"([^"]+)"/g);
        
        if (matches && matches.length > 0) {
           const answers = matches.map(m => m.replace(/^"|"$/g, ''));
           // CRITICAL: Always set answers for text type (don't append if type was different)
           // This ensures correctAnswers is properly set for composite sub-questions
           currentCorrectAnswers = answers;
           currentQuestion.type = 'text';
        } else {
           // Quotes exist but maybe empty ""? or bad format
           // Fallback to raw content
           currentCorrectAnswers = [content];
           currentQuestion.type = 'text';
        }
      } else {
        // Simple text result (Unquoted, legacy)
        // Check for CSV without quotes? No, user specified quotes.
        // Treat whole line as one answer if no quotes found.
        currentCorrectAnswers = [content];
        currentQuestion.type = 'text';
      }
      continue;
    }

    // 5. Group Definition (case-insensitive & multi-line)
    if (line.match(/^group:/i)) {
      const { content, nextIdx } = accumulateLines(i);
      i = nextIdx; // Update loop index
      
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

    // 6. Generic Content (Continuation)
    // If line didn't match any specific block start, it might be a continuation of the previous block
    // (e.g. multi-line question text, or text split by image markers)
    
    if (currentOptions.length > 0) {
      // Append to the last option
      // Use space separator for continuity (Word wrap) or newline?
      // wordParser.ts cleanText joins lines with \n. But cleanWordText trims them.
      // Usually space is safer for flow, unless it's a list. 
      // Let's use space.
      const lastIdx = currentOptions.length - 1;
      currentOptions[lastIdx] += " " + line;
      
      // If this option was correct, update the correct answers list
      // Note: This is tricky because correctAnswers stores the value string.
      // We need to find the old value and update it.
      // But we just modified currentOptions[lastIdx].
      // The OLD value is not easily available unless we stored it.
      // A simple heuristic: If the option was just added, it might be at the end of correctAnswers?
      // Or we iterate to find a partial match?
      
      // Better: we don't support multi-line text for correct answer checking perfectly here without refactor.
      // BUT for "Single/Multiple" choice, the exact string match matters.
      // If we change the option text, we MUST change the correct answer text.
      
      // Let's rely on the fact that if we are extending an option, it's likely the ONE we just processed?
      // No, we could be lines down.
      
      // Attempt to resync: 
      // If we can't easily resync, the user might need to re-select correct answer in editor.
      // But let's try:
      // We know `line` was appended. So `currentOptions[lastIdx]` ends with `line`.
      // The old value was `currentOptions[lastIdx]` minus ` " " + line`.
      const newVal = currentOptions[lastIdx];
      const oldVal = newVal.substring(0, newVal.length - (line.length + 1));
      
      const caIdx = currentCorrectAnswers.indexOf(oldVal);
      if (caIdx !== -1) {
        currentCorrectAnswers[caIdx] = newVal;
      }
      
    } else if (currentQuestion.question) {
      // FIX: Don't append to question if line contains { (likely start of composite block)
      // This prevents content like "{Câu 1: ..." from being appended to the parent question
      // Check if line contains { that's not part of LaTeX command
      const trimmedLine = line.trim();
      const hasCompositeBrace = trimmedLine.includes('{') && !trimmedLine.match(/\\[a-zA-Z]+\{/);
      
      if (hasCompositeBrace) {
        // This looks like a composite block start, don't append to question
        // Instead, trigger composite block handling
        const braceIndex = line.indexOf('{');
        const beforeBrace = line.substring(0, braceIndex).trim();
        const afterBrace = line.substring(braceIndex + 1).trim();
        
        // If there's content before {, it might be part of the question, but we should stop here
        // and start composite mode. However, if { is at the start, we're good.
        // For safety, if there's content before {, we might want to append it to question first
        // But actually, if normalization worked, { should be on its own line
        // So if we see content before {, it means normalization didn't work, and we should
        // not append anything to question
        
        isCollectingComposite = true;
        const braces = countBracesIgnoringLatex(line);
        compositeBraceCount = braces.open - braces.close;
        
        if (afterBrace && afterBrace !== '}') {
            compositeBuffer.push(afterBrace);
        }
        
        if (compositeBraceCount <= 0) {
            isCollectingComposite = false;
            compositeBraceCount = 0;
        }
      } else {
        // Append to question
        currentQuestion.question += " " + line;
      }
    }
  }

  // Flush last question
  flushQuestion();

  return questions;
}

function determineQuestionType(
  correctAnswers: string[],
  options?: string[]
): "single" | "multiple" | "text" {
  if (Array.isArray(options) && options.length > 0) {
    // Nếu có options, nhưng không có đáp án đúng -> vấn là single (để hiển thị editor)
    if (correctAnswers.length > 1) {
      return "multiple";
    }
    return "single";
  }
  
  // Không có options
  if (correctAnswers.length === 0) {
    return "text"; 
  } else if (correctAnswers.length === 1) {
    return "single"; // Trường hợp hiếm, có thể là điền khuyết
  } else {
    return "multiple"; // Trường hợp hiếm
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
