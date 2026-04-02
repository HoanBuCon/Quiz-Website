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

/**
 * Converts an array of JSON questions back into the application's standard text format.
 * This is used to populate the editor after AI extraction or generation.
 */
export function questionsToStandardText(questions: any[]): string {
  return questions.map((q, index) => {
    let text = `Câu ${index + 1}: ${q.question}\n`;

    if (q.type === 'single' || q.type === 'multiple' || q.type === 'multiple-choice') {
      const options = Array.isArray(q.options) ? q.options : [];
      options.forEach((opt: string, i: number) => {
        // AI might return answer as a single string (single choice) or array (multiple choice)
        const isCorrect = Array.isArray(q.correctAnswers) 
          ? q.correctAnswers.includes(opt)
          : (Array.isArray(q.answer) 
              ? q.answer.includes(opt) 
              : (opt === q.answer || opt === q.correctAnswers));
        
        text += `${isCorrect ? '*' : ''}${String.fromCharCode(65 + i)}. ${opt}\n`;
      });
    } else if (q.type === 'multi-true-false' || (q.type === 'composite' && q.subQuestions)) {
      text += `{\n`;
      const subQs = q.subQuestions || [];
      subQs.forEach((sub: any, subIndex: number) => {
        text += `Câu ${subIndex + 1}: ${sub.question || sub.statement}\n`;
        const isTrue = sub.answer === 'True' || sub.answer === 'Đúng' || (Array.isArray(sub.correctAnswers) && sub.correctAnswers.includes('Đúng'));
        if (isTrue) {
          text += `*A. Đúng\nB. Sai\n\n`;
        } else {
          text += `A. Đúng\n*B. Sai\n\n`;
        }
      });
      text += `}\n`;
    } else if (q.type === 'drag') {
      const items = q.options?.items || [];
      const targets = q.options?.targets || [];
      const mapping = q.correctAnswers || q.answer || {};

      // result: ["Item 1", "Item 2"]
      const itemLabels = items.map((it: any) => it.label || it);
      text += `result: ${JSON.stringify(itemLabels)}\n`;

      // group: ("Target 1": ["Item 1"]), ("Target 2": ["Item 2"])
      const targetList = Array.isArray(targets) ? targets : [];
      const groupStrings = targetList.map((t: any) => {
        const targetLabel = t.label || t;
        const targetId = t.id || t;
        const targetItems = items
          .filter((it: any) => {
            const itemId = it.id || it;
            return mapping[itemId] === targetId;
          })
          .map((it: any) => it.label || it);
        return `("${targetLabel}": ${JSON.stringify(targetItems)})`;
      });
      text += `group: ${groupStrings.join(',\n ')}\n`;
    } else {
      // Short answer / text
      const answers = Array.isArray(q.correctAnswers) 
        ? q.correctAnswers 
        : (q.answer ? [q.answer] : []);
      
      if (answers.length > 1) {
        text += `result: ${answers.map((a: string) => `"${a}"`).join(', ')}\n`;
      } else if (answers.length === 1) {
        text += `result: "${answers[0]}"\n`;
      }
    }

    if (q.explanation) {
      text += `Giải thích: ${q.explanation}\n`;
    }

    return text;
  }).join('\n');
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
          /[0-9+\-*/^_=<>,\.]/.test(mathExpr) || // Contains numbers or operators (added comma and dot)
          /[a-zA-Z0-9_^=]/.test(beforeExpr.slice(-1)) || // Preceded by letter/number/equals
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
    
    // FIX: Normalizing 'Explanation' / 'Giải thích' to always start on a new line
    .replace(/([^\n])\s*(Giải thích:|Explanation:)/gi, '$1\n$2')
    
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
      // FIX: Use same logic as shouldStartComposite to detect composite braces
      // If it starts with { and doesn't look like math, it's a new block
      if (line === "{" || line === "}") return true;
      
      const hasMathBrace = 
        line.match(/[_^]\s*\{/) ||     // Subscript or superscript
        line.match(/=\s*\{/) ||         // Set notation like T ={H,E}
        line.match(/\\\w+\{/) ||        // LaTeX commands like \frac{
        line.match(/\{[^{}]*\}/);       // Simple balanced braces with content (not multi-line)
        
      if (line.startsWith("{") && !hasMathBrace) return true;
      
      // 5. Options (*A., A.)
      if (line.match(/^[*]?\s*[A-Z]\.\s*/)) return true;
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
        content += separator + nextLine; // Use correct separator
        nextIdx++;
      }
      
      // Return adjusted index (loop will increment, so return nextIdx - 1)
      return { content: content.trim(), nextIdx: nextIdx - 1 };
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

           // NEW: Check for Post-Block Explanation (after closing bracket)
           let lookAheadIdx = i + 1;
           while (lookAheadIdx < lines.length) {
              const nextLine = lines[lookAheadIdx];
              // Skip empty lines to find next content
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

    // 6. Explanation (case-insensitive & multi-line)
    if (line.match(/^(Giải thích|Explanation)\s*:/i)) {
      const { content, nextIdx } = accumulateLines(i);
      i = nextIdx; // Update loop index
      currentQuestion.explanation = content;
      continue;
    }

    // 7. Generic Content (Continuation)
    // If line didn't match any specific block start, it might be a continuation of the previous block
    
    if (currentOptions.length > 0) {
      // Append to the last option
      const lastIdx = currentOptions.length - 1;
      currentOptions[lastIdx] += " " + line;
      
      // Attempt to resync correct answers if we modified an option that was correct
      const newVal = currentOptions[lastIdx];
      const oldVal = newVal.substring(0, newVal.length - (line.length + 1));
      
      const caIdx = currentCorrectAnswers.indexOf(oldVal);
      if (caIdx !== -1) {
        currentCorrectAnswers[caIdx] = newVal;
      }
    } else if (currentQuestion.question) {
      // FIX: Don't append to question if line is TRULY a composite block start
      // But DO append if it's just a math expression with braces
      const trimmedLine = line.trim();
      
      // Check if the line contains { that's part of a math expression (NOT composite)
      // Math patterns: _{0}, ^{2}, ={H,E}, \frac{}, etc.
      const hasMathBrace = 
        trimmedLine.match(/[_^]\s*\{/) ||     // Subscript or superscript
        trimmedLine.match(/=\s*\{/) ||         // Set notation like T ={H,E}
        trimmedLine.match(/\\\w+\{/) ||        // LaTeX commands like \frac{
        trimmedLine.match(/\{[^{}]*\}/);       // Simple balanced braces with content (not multi-line)
      
      // Line is a composite block only if:
      // 1. It starts with { (standalone brace)
      // 2. OR it starts with { followed by "Câu" 
      // AND it doesn't look like math
      const isCompositeStart = 
        (trimmedLine === '{' || trimmedLine.startsWith('{')) && 
        !hasMathBrace;
      
      if (isCompositeStart) {
        // This looks like a composite block start, trigger composite mode
        const braceIndex = line.indexOf('{');
        const afterBrace = line.substring(braceIndex + 1).trim();
        
        isCollectingComposite = true;
        const braces = countBracesIgnoringLatex(line);
        compositeBraceCount = braces.open - braces.close;
        
        if (afterBrace && afterBrace !== '}') {
            compositeBuffer.push(afterBrace);
        }
        
        if (compositeBraceCount <= 0) {
            isCollectingComposite = false;
            compositeBraceCount = 0;
            compositeBuffer = [];
        }
      } else {
        // Append to question (including lines with math braces)
        // Use newline to preserve original formatting
        currentQuestion.question += "\n" + line;
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
