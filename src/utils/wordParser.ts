import mammoth from "mammoth";
import JSZip from "jszip";

export interface WordParseResult {
  success: boolean;
  content?: string;
  images?: import('../types').ExtractedImage[];
  error?: string;
}

export async function parseWordFile(file: File): Promise<WordParseResult> {
  try {
    let arrayBuffer = await file.arrayBuffer();

    // --- Pre-process DOCX to handle Math Equations (OMML) ---
    try {
      // --------------------------------------------------------
      // MAMMOTH PREPROCESSING: Convert Office Math (OMML) to LaTeX BEFORE mammoth
      // Mammoth doesn't handle math equations well, so we convert them to text first
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file("word/document.xml")?.async("string");

      if (docXml) {
        // DEBUG: Search for x-bar in raw XML before any processing
        const xBarPatterns = [
          'x̄',           // Precomposed x-bar (U+0078 U+0304 or U+0304)
          'x\u0304',     // x + combining overline
          /x[^>]*?combining/i,  // x with combining markup
          /<w:t[^>]*>x<\/w:t>/  // Plain x in text nodes (to compare)
        ];
        
        // console.log('🔍 Searching for x-bar in RAW Word XML:');
        xBarPatterns.forEach((pattern, idx) => {
          const matches = typeof pattern === 'string' 
            ? docXml.includes(pattern)
            : pattern.test(docXml);
          if (matches) {
            // console.log(`  ✅ Pattern ${idx} FOUND: ${pattern}`);
            // Show context
            if (typeof pattern === 'string') {
              const index = docXml.indexOf(pattern);
              if (index !== -1) {
                // console.log(`     Context: ...${docXml.substring(index - 20, index + 50)}...`);
              }
            }
          }
        });

        const parser = new DOMParser();
        const doc = parser.parseFromString(docXml, "application/xml");

        // Find all Math elements (m:oMath)
        // We use getElementsByTagNameNS if possible, or just tag name with prefix
        // Browsers might require namespaces, but "m:oMath" usually works in simple XML parse
        // Find all Math elements (m:oMath and m:oMathPara)
        // Use getElementsByTagName("*") and check localName to be robust against namespace prefixes
        const allElements = Array.from(doc.getElementsByTagName("*"));
        let mathNodes: Element[] = [];
        
        allElements.forEach(el => {
          const name = el.nodeName.toLowerCase();
          const local = el.localName ? el.localName.toLowerCase() : "";
          
          if (local === "omath" || local === "omathpara" || 
              name.endsWith(":omath") || name === "omath" ||
              name.endsWith(":omathpara") || name === "omathpara") {
             mathNodes.push(el);
          }
        });
        
        // Filter: If we have oMathPara, we prefer to process that as the unit.
        // If oMath is inside oMathPara, we should skip it if we process parent.
        // Actually, if we process bottom-up or top-down?
        // If we process oMathPara, we convert it to text. The child oMath is gone.
        // So validation "if (node.parentNode)" inside loop is good enough.
        
        // However, we want to prioritize oMathPara if it exists to preserve paragraph structure logic?
        // Let's just sort by depth or just process and check attachment.

        
        let modified = false;

        if (mathNodes.length > 0) {
          // console.log(`Found ${mathNodes.length} math formulas. Converting to LaTeX...`);
          
          mathNodes.forEach((node) => {
            // FIX: Check if node is still connected to document
            let isConnected = false;
            if (doc.contains && typeof doc.contains === 'function') {
                isConnected = doc.contains(node);
            } else {
                let parent = node.parentNode;
                while (parent) {
                    if (parent === doc) {
                        isConnected = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
            }
            if (!isConnected) return;

            try {
              let latex = convertOMMLToLatex(node);
              if (latex) {
                // console.log(`📐 OMML → LaTeX: "${latex.substring(0, 80)}"`);
                
                // Convert to linear format to match copy-paste style
                latex = convertToLinearFormat(latex);
                
                // FINAL FIX: Force remove ALL spaces before } to fix {n } → {n}
                // This is the last line of defense against Word XML whitespace
                latex = latex.replace(/\s+}/g, '}');
                latex = latex.replace(/{\s+/g, '{');
                
                // console.log(`   → Linear: "${latex.substring(0, 80)}"`);
                
                // Create a new Text Run <w:r><w:t>...</w:t></w:r>
                const run = doc.createElement("w:r");
                const textNode = doc.createElement("w:t");
                // Preserve whitespace
                textNode.setAttribute("xml:space", "preserve");
                // FIX: Remove padding spaces to avoid extra space before closing braces
                textNode.textContent = latex;
                
                run.appendChild(textNode);
                
                // Identify the target node to replace (unwrap AlternateContent/oMathPara)
                let targetNode: Node = node;
                let currentParent = node.parentNode;
                
                // Traverse up to find the outermost container specific to this math equation
                // We want to replace the whole AlternateContent block if present
                while (currentParent) {
                  const tag = (currentParent as Element).localName;
                  if (tag === 'oMathPara' || tag === 'Choice' || tag === 'AlternateContent') {
                    targetNode = currentParent;
                    currentParent = currentParent.parentNode;
                  } else {
                    // Stop if we hit a standard document element (p, r, body, etc.)
                    break;
                  }
                }

                // Check if we are replacing a block-level element directly in the body
                const parentTag = (targetNode.parentNode as Element)?.localName;
                if (parentTag === 'body' || parentTag === 'tc') { // body or table cell
                   // Wrap in paragraph if it's at block level
                   const para = doc.createElement("w:p");
                   para.appendChild(run);
                   targetNode.parentNode?.replaceChild(para, targetNode);
                } else {
                   // Inline replacement
                   targetNode.parentNode?.replaceChild(run, targetNode);
                }
                
                modified = true;
              }
            } catch (err) {
              // console.warn("Failed to convert math node", err);
            }
          });
        }
        
        // After all processing, convert Unicode combining characters globally
        // This catches x̄ that are outside of <m:oMath> elements
        const body = doc.querySelector("w\\:body");
        if (body) {
          // Process all text nodes
          const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          const textNodesToUpdate: { node: Text; newValue: string }[] = [];
          
          let currentNode = walker.nextNode();
          while (currentNode) {
            const textContent = currentNode.textContent || "";
            // Convert Unicode combining overline to LaTeX
            const converted = textContent.replace(/([a-zA-Z])\u0304/g, '\\overline{$1\\vphantom{b}}');
            if (converted !== textContent) {
              textNodesToUpdate.push({ node: currentNode as Text, newValue: converted });
            }
            currentNode = walker.nextNode();
          }
          
          // Apply updates
          textNodesToUpdate.forEach(({ node, newValue }) => {
            node.textContent = newValue;
          });
          
          if (textNodesToUpdate.length > 0) {
            modified = true;
            // console.log(`🔧 Converted ${textNodesToUpdate.length} Unicode combining characters to LaTeX`);
            textNodesToUpdate.forEach((update, idx) => {
              if (idx < 3) { // Log first 3 for debugging
                // console.log(`  [${idx}]: "${update.node.textContent?.substring(0, 50)}" → "${update.newValue.substring(0, 50)}"`);
              }
            });
          }
        }
        
        if (modified) {
           // Serialize back content
           const serializer = new XMLSerializer();
           const newXml = serializer.serializeToString(doc);
           
           // Update zip
           zip.file("word/document.xml", newXml);
           
           // Generate new array buffer
           arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
        }
      }
    } catch (e) {
      // console.warn("JSZip pre-processing failed, falling back to original content:", e);
    }
    // --------------------------------------------------------

    // Array để lưu extracted images
    const extractedImages: import('../types').ExtractedImage[] = [];
    let imageCounter = 0;

    // Custom image converter: convert images to base64 and track position
    const convertImage = mammoth.images.imgElement((image: any) => {
      return image.read("base64").then((imageBuffer: string) => {
        // Tạo data URL từ base64
        const contentType = image.contentType || "image/png";
        const dataUrl = `data:${contentType};base64,${imageBuffer}`;
        
        // Tạo unique ID cho image
        const imageId = `img-${Date.now()}-${imageCounter++}`;
        
        // Lưu image vào array
        extractedImages.push({
          id: imageId,
          data: dataUrl,
          position: imageCounter - 1,
          questionIndex: null,
          location: 'unassigned'
        });
        
        // Return marker để đánh dấu vị trí ảnh trong text
        // Use ALT attribute to carry the ID, as SRC might be sanitized or encoded unpredictably
        // Return marker để đánh dấu vị trí ảnh trong text
        // Use a SPECIAL URL format that we can detect later.
        // This avoids invalid URL issues or attribute stripping.
        // We will replace this with the real data URL in the extractedImages array,
        // but for the HTML text content, we want the ID marker.
        return {
          src: `http://quiz-placeholder/image/${imageId}` 
        };
      });
    });

    // Custom style map to ensure equations and special text boxes are rendered as paragraphs if possible
    const options = {
      convertImage: convertImage,
      styleMap: [
        "p[style-name='Equation'] => p:fresh",
        "p[style-name='Caption'] => p:fresh",
        "p[style-name='Subtitle'] => p:fresh",
        "r[style-name='Equation Part'] => span:fresh"
      ],
      includeDefaultStyleMap: true
    };

    // Chuyển đổi Word sang HTML với image converter
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      options
    );

    if (result.messages.length > 0) {
      // console.warn("Word parsing warnings:", result.messages);
    }

    // Extract text từ HTML và thay thế image tags bằng markers
    const htmlContent = result.value;
    
    // Parse HTML và extract text, giữ lại image markers và line breaks
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Replace img tags with [IMAGE:id] markers
    const imgTags = doc.querySelectorAll('img');
    imgTags.forEach(img => {
      let markerText = '[IMAGE]';
      const src = img.getAttribute('src') || '';
      
      // Check for our special placeholder
      // Format: http://quiz-placeholder/image/img-1234...
      if (src.includes('quiz-placeholder/image/')) {
          const parts = src.split('quiz-placeholder/image/');
          if (parts.length > 1) {
              const id = parts[1];
              markerText = `[IMAGE:${id}]`;
          }
      } 
      // Fallback for legacy (should not happen with new logic)
      else if (src.includes('[IMAGE:')) {
           markerText = src;
      }
      
      const marker = doc.createTextNode(`\n${markerText}\n`);
      img.parentNode?.replaceChild(marker, img);
    });
    
    // Extract text with proper line breaks
    // Process block elements (p, div, br, etc.) to preserve paragraph structure
    let plainText = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        plainText += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Add newlines for block elements
        if (['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tagName)) {
          if (tagName === 'br') {
            plainText += '\n';
          } else if (plainText && !plainText.endsWith('\n')) {
            plainText += '\n';
          }
        }
        
        // Recursively process children
        node.childNodes.forEach(child => walk(child));
        
        // Add trailing newline for block elements
        if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tagName)) {
          if (!plainText.endsWith('\n')) {
            plainText += '\n';
          }
        }
      }
    };
    
    if (doc.body) {
      walk(doc.body);
    }

    // Làm sạch text để phù hợp với format của docsParser
    let cleanedText = cleanWordText(plainText);
    
    // CRITICAL: Apply processMathInput to match copy-paste behavior
    // This converts x̄ → \overline{x\vphantom{b}} and other math notation
    // Import at top of file
    const { processMathInput } = await import('./mathConverter');
    const lines = cleanedText.split('\n');
    const processedLines = lines.map(line => processMathInput(line));
    cleanedText = processedLines.join('\n');
    
    // DEBUG: Log sample text to find x-bar
    const sampleLines = cleanedText.split('\n').slice(0, 30);
    const linesWithOverline = sampleLines.filter(l => l.includes('overline'));
    if (linesWithOverline.length > 0) {
      // console.log('✅ Found \\overline after processMathInput:');
      linesWithOverline.slice(0, 3).forEach((line, idx) => {
        // console.log(`  [${idx}]: ${line.substring(0, 80)}`);
      });
    }

    // console.log(`✓ Extracted ${extractedImages.length} images from Word document`);

    return {
      success: true,
      content: cleanedText,
      images: extractedImages.length > 0 ? extractedImages : undefined,
    };
  } catch (error) {
    // console.error("Error parsing Word file:", error);
    return {
      success: false,
      error: `Không thể đọc file Word: ${
        error instanceof Error ? error.message : "Lỗi không xác định"
      }`,
    };
  }
}

/**
 * Convert Unicode combining characters to LaTeX notation
 * Common in Word documents where math symbols are stored as Unicode
 */
function convertUnicodeToLatex(text: string): string {
  let result = text;
  
  // x̄ (combining overline U+0304) → \overline{x\vphantom{b}}
  // Pattern: any letter + combining overline
  result = result.replace(/([a-zA-Z])\u0304/g, '\\overline{$1\\vphantom{b}}');
  
  // ȳ, s̄, etc - similar pattern for any variable
  // The regex above handles all cases
  
  return result;
}

/**
 * Convert LaTeX format to linear notation (matching copy-paste style)
 * - \sqrt{...} → \sqrt(...)
 * - Fix brace positioning: {x_i} → x_{i}, {s^2} → s^{2}
 * - Remove unnecessary outer braces
 * - \left( and \right) → ( and )
 */
function convertToLinearFormat(latex: string): string {
  let result = latex;
  
  // Convert \sqrt{...} to \sqrt(...)
  let attempts = 0;
  const maxAttempts = 100;
  
  while (result.includes('\\sqrt{') && attempts < maxAttempts) {
    attempts++;
    const sqrtIndex = result.indexOf('\\sqrt{');
    if (sqrtIndex === -1) break;
    
    // Replace opening
    result = result.substring(0, sqrtIndex) + '\\sqrt(' + result.substring(sqrtIndex + 6);
    
    // Find matching closing brace
    let braceCount = 1;
    let i = sqrtIndex + 6; // after '\sqrt('
    while (i < result.length && braceCount > 0) {
      if (result[i] === '\\' && i + 1 < result.length) {
        i += 2; // skip escaped char
        continue;
      }
      if (result[i] === '{') braceCount++;
      else if (result[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          // Replace this } with )
          result = result.substring(0, i) + ')' + result.substring(i + 1);
          break;
        }
      }
      i++;
    }
    if (braceCount !== 0) break; // Unmatched, stop trying
  }
  
  // Simplify single-letter/digit subscripts and superscripts
  // ^{n} → ^n, _{i} → _i (but keep _{i=1}, _{max}, etc.)
  // Simplify single-letter/digit subscripts and superscripts
  // REMOVED: User prefers strict LaTeX format (e.g., s^{2})
  // result = result.replace(/_\{([a-zA-Z0-9])\}/g, '_$1');
  // result = result.replace(/\^\{([a-zA-Z0-9])\}/g, '^$1');
  
  // \left( and \right) → just ( and )
  result = result.replace(/\\left\s*\(/g, '(');
  result = result.replace(/\\right\s*\)/g, ')');
  
  // Remove extra spaces around math operators but preserve single spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  // FIX: Remove spaces inside braces to fix {n } → {n} and { n-1 } → {n-1}
  // This handles trailing spaces before } and leading spaces after {
  result = result.replace(/\{\s+/g, '{');  // Remove space after {
  result = result.replace(/\s+\}/g, '}');  // Remove space before }
  
  return result;
}

/**
 * Helper function to protect LaTeX expressions before text cleaning
 * Extracts LaTeX content and replaces it with placeholders
 */
function protectLatexExpressions(text: string): { text: string; protectedExpressions: string[] } {
  const protectedExpressions: string[] = [];
  let result = text;

  // Protect display math $$...$$
  result = result.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const index = protectedExpressions.length;
    protectedExpressions.push(match.replace(/\n/g, ' ').replace(/\s+/g, ' '));
    return `__LATEX_PROTECTED_${index}__`;
  });

  // Protect inline math $...$
  result = result.replace(/\$[^$\n]+\$/g, (match) => {
    const index = protectedExpressions.length;
    protectedExpressions.push(match.replace(/\n/g, ' ').replace(/\s+/g, ' '));
    return `__LATEX_PROTECTED_${index}__`;
  });

  // Protect LaTeX commands with braces (ANY level of nesting supported)
  // Use a proper brace-matching algorithm instead of regex
  // IMPORTANT: Capture ALL consecutive brace arguments (e.g., \frac{num}{den})
  let i = 0;
  while (i < result.length) {
    // Look for backslash followed by letters
    if (result[i] === '\\' && i + 1 < result.length && /[a-zA-Z]/.test(result[i + 1])) {
      // Extract command name
      let cmdStart = i;
      i++; // skip backslash
      while (i < result.length && /[a-zA-Z]/.test(result[i])) {
        i++;
      }
      
      // Skip whitespace after command
      while (i < result.length && /\s/.test(result[i])) {
        i++;
      }
      
      // Check if followed by opening brace - and capture ALL consecutive brace groups
      let hasAnyBraces = false;
      let cmdEnd = i;
      
      while (i < result.length && result[i] === '{') {
        hasAnyBraces = true;
        // Match braces properly
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
        
        // If braces didn't match, break
        if (braceCount !== 0) {
          break;
        }
        
        // Update end position
        cmdEnd = i;
        
        // Skip whitespace before next potential brace group
        while (i < result.length && /\s/.test(result[i])) {
          i++;
        }
      }
      
      // If we found at least one brace group, protect the entire command
      if (hasAnyBraces) {
        const latexCmd = result.substring(cmdStart, cmdEnd);
        const index = protectedExpressions.length;
        // Remove internal newlines and normalize spaces
        // FIX: Also trim spaces before closing braces to avoid "n }" -> "n}"
        let normalizedLatex = latexCmd.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        normalizedLatex = normalizedLatex.replace(/\s+}/g, '}'); // Remove space before }
        protectedExpressions.push(normalizedLatex);
        
        // Replace in result
        result = result.substring(0, cmdStart) + `__LATEX_PROTECTED_${index}__` + result.substring(cmdEnd);
        // Reset i to continue after the replacement
        i = cmdStart + `__LATEX_PROTECTED_${index}__`.length;
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

function cleanWordText(text: string): string {
  // Loại bỏ các ký tự đặc biệt và định dạng không cần thiết
  // GIỐNG HỆT VỚI docsParser.ts để đảm bảo format nhất quán
  
  // STEP 1: Protect LaTeX expressions before processing
  const { text: protectedText, protectedExpressions: latexExpressions } = protectLatexExpressions(text);
  
  // STEP 2: Apply all cleaning operations on protected text
  const cleaned = protectedText
    // Normalize line endings to \n (handle Windows CRLF and Mac CR)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Thay thế smart quotes (quotes cong) bằng quotes thẳng
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Thay thế Vertical Tab (\x0B) bằng newline để tránh dính dòng
    // eslint-disable-next-line no-control-regex
    .replace(/\x0B/g, "\n")
    // Loại bỏ các ký tự điều khiển khác (giữ lại \n, \t)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0C\x0E-\x1F\x7F]/g, "")
    // Thay thế các ký tự bullet points bằng format chuẩn (giữ nguyên * nếu có)
    // Chỉ loại bỏ bullet points không phải *, giữ lại * để đánh dấu đáp án đúng
    .replace(/^[•·▪▫◦‣⁃]\s*/gm, "")
    // Relaxed number removal to avoid stripping math lines starting with numbers
    .replace(/^[1-9]\.\s*/gm, "")
    // Chuẩn hóa khoảng trắng trong dòng (không loại bỏ dòng trống)
    .replace(/[ \t]+/g, " ")
    // Loại bỏ khoảng trắng ở đầu và cuối dòng
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    // Loại bỏ các dòng trống ở đầu và cuối file
    .trim();
  
  // STEP 3: Restore LaTeX expressions (now without internal newlines)
  return restoreLatexExpressions(cleaned, latexExpressions);
}

export function validateWordFormat(content: string): {
  isValid: boolean;
  errors: string[];
} {
  // SỬ DỤNG CÙNG LOGIC VALIDATION VỚI docsParser
  // để đảm bảo format nhất quán
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

  // Relaxed validation - giống docsParser
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

// --- Helper to convert OMML (Word Math) to LaTeX ---
// Simple recursive converter covering common math structures
function convertOMMLToLatex(node: Node): string {
  if (!node) return "";
  
  const element = node as Element;
  const tagName = element.localName; // Using localName to ignore namespace prefix (e.g. 'f' from 'm:f')

  // Helper to get text content of children (recursively)
  const getChildrenText = (parent: Element, filter?: string) => {
     let text = "";
     for (let i = 0; i < parent.childNodes.length; i++) {
         const child = parent.childNodes[i];
         if (!filter || (child as Element).localName === filter) {
             text += convertOMMLToLatex(child);
         }
     }
     return text;
  };

  // Helper to find a specific child element (e.g. m:num)
  const findChild = (parent: Element, name: string) => {
      for (let i = 0; i < parent.childNodes.length; i++) {
          const child = parent.childNodes[i] as Element;
          if (child.localName === name) return child;
      }
      return null;
  };

  switch (tagName) {
    case "oMath": // Wrapper
    case "oMathPara":
    case "e": // Base element
      return getChildrenText(element);
    
    // Fraction
    case "f":
      const num = findChild(element, "num");
      const den = findChild(element, "den");
      return `\\frac{${convertOMMLToLatex(num!)}}{${convertOMMLToLatex(den!)}}`;
      
    // Radical / Root
    case "rad":
      const deg = findChild(element, "deg"); // Degree (optional)
      const base = findChild(element, "e");
      if (deg && deg.textContent) {
          // Check if deg is empty (hidden) -> has m:ctrlPr?
          // Simplest is to check text
          const degText = convertOMMLToLatex(deg);
          if (degText) {
             return `\\sqrt[${degText}]{${convertOMMLToLatex(base!)}}`;
          }
      }
      return `\\sqrt{${convertOMMLToLatex(base!)}}`;
      
    // Bar (Overline) - e.g., x̄
    case "bar":
      const barE = findChild(element, "e");
      const barContent = convertOMMLToLatex(barE!);
      // Add \vphantom{b} to match copy-paste format
      return `\\overline{${barContent}\\vphantom{b}}`;    

    // Accent (e.g. Overline built with Accent)
    case "acc":
      const accE = findChild(element, "e");
      if (!accE) return ""; 

      const content = convertOMMLToLatex(accE);
      const accPr = findChild(element, "accPr");
      
      if (accPr) {
          const chr = findChild(accPr, "chr");
          const val = chr?.getAttribute("m:val");
          
          // Overline
          if (val === "̅" || val === "¯" || val === "\u0305" || val === "\u00AF") {
              return `\\overline{${content}\\vphantom{b}}`;
          } 
          // Hat
          else if (val === "̂" || val === "\u0302") { 
               return `\\hat{${content}}`;
          } 
          // Check/Caron
          else if (val === "̌" || val === "\u030C") {
               return `\\check{${content}}`;
          }
          // Tilde
          else if (val === "̃" || val === "\u0303") { 
               return `\\tilde{${content}}`;
          } 
          // Vector (Arrow)
          else if (val === "⃗" || val === "\u20D7") { 
               return `\\vec{${content}}`;
          }
          // Dot
          else if (val === "̇" || val === "\u0307") { 
               return `\\dot{${content}}`;
          }
          // Double Dot
          else if (val === "̈" || val === "\u0308") { 
               return `\\ddot{${content}}`;
          }
      }
      
      // Fallback: just return inner content (or we could assume overline for stats, but that's risky)
      // Given the user specifically asked for x-bar support in Word, and we handled it above,
      // this fallback covers cases where accent property is missing or unrecognized.
      return content;    
      
    // Superscript
    case "sSup":
      const supE = findChild(element, "e");
      const sup = findChild(element, "sup");
      return `${convertOMMLToLatex(supE!)}^{${convertOMMLToLatex(sup!)}}`;
      
    // Subscript
    case "sSub":
      const subE = findChild(element, "e");
      const sub = findChild(element, "sub");
      return `${convertOMMLToLatex(subE!)}_{${convertOMMLToLatex(sub!)}}`;
      
    // SubSup
    case "sSubSup":
      const subSupE = findChild(element, "e");
      const subS = findChild(element, "sub");
      const supS = findChild(element, "sup");
      return `${convertOMMLToLatex(subSupE!)}_{${convertOMMLToLatex(subS!)}}^{${convertOMMLToLatex(supS!)}}`;
      
    // N-ary (Sum, Integral, etc.)
    case "nary":
       const narySub = findChild(element, "sub");
       const narySup = findChild(element, "sup");
       const naryE = findChild(element, "e");
       
       // Operator character (e.g. ∑, ∫)
       let op = "";
       const naryPr = findChild(element, "naryPr");
       if (naryPr) {
           const chr = findChild(naryPr, "chr");
           if (chr && chr.getAttribute("m:val")) {
               const val = chr.getAttribute("m:val");
               if (val === "∑") op = "\\sum";
               else if (val === "∫") op = "\\int";
               else if (val === "∏") op = "\\prod";
               else op = val || "";
           } else {
               // Default usually Sum if not specified? Or we check default
               // Actually, nary without chr usually defaults to integral in some contexts or sum?
               // Let's guess Sum if simple, but often it's explicit.
               // If empty, it might be Sum.
               op = "\\sum"; 
           }
       } else {
           op = "\\sum";
       }

       let result = op;
       if (narySub) {
           const t = convertOMMLToLatex(narySub);
           if (t) result += `_{${t}}`;
       }
       if (narySup) {
           const t = convertOMMLToLatex(narySup);
           if (t) result += `^{${t}}`;
       }
       result += convertOMMLToLatex(naryE!);
       return result;
       
    // Delimiters (Parentheses, etc.)
    case "d":
       const dPr = findChild(element, "dPr");
       const dE = findChild(element, "e"); // Body
       
       let begChr = "(";
       let endChr = ")";
       if (dPr) {
           const beg = findChild(dPr, "begChr");
           if (beg) begChr = beg.getAttribute("m:val") || "(";
           const end = findChild(dPr, "endChr");
           if (end) endChr = end.getAttribute("m:val") || ")";
       }
       // LaTeX formatting for auto-sizing delimiters
       return `\\left${begChr}${convertOMMLToLatex(dE!)}\\right${endChr}`;
       
    // Text Run
    case "r": // m:r
       // Contains m:t
       // In OMML, m:r can contain m:t (text)
       // Standard runs w:r are different.
       // Check for m:t
       const t = findChild(element, "t");
       if (t) return t.textContent || "";
       
       // Or normal w:r if embedded? (Usually m:r > w:t is not valid, it's m:t)
       // But sometimes m:wrapper contains w:r
       // Let's just traverse children
       return getChildrenText(element);
       
    case "t": // m:t
       // FIX: Trim to remove trailing/leading whitespace from Word XML
       return (element.textContent || "").trim();
       
    default:
       // Fallback: traverse children
       if (node.hasChildNodes()) {
           return getChildrenText(element);
       }
       // Text Node
       if (node.nodeType === 3) {
           // FIX: Trim to remove trailing/leading whitespace from Word XML
           let textContent = (node.textContent || "").trim();
           // Convert Unicode combining characters inline
           textContent = textContent.replace(/([a-zA-Z])\u0304/g, '\\overline{$1\\vphantom{b}}');
           return textContent;
       }
       return "";
  }
}
