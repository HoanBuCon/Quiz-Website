/**
 * Robust Math Converter for Vietnamese/Word Math Input
 * Handles complex mathematical expressions while avoiding conflicts with parsers
 */

export interface ConversionOptions {
  autoWrap?: boolean; // Tự động wrap trong $...$ nếu phát hiện math
  preserveMarkers?: boolean; // Giữ nguyên [IMAGE:id] markers
  preserveWhitespace?: boolean; // Giữ nguyên khoảng trắng (cho paste text/code)
}

/**
 * Main conversion function - converts Unicode/Word math to LaTeX
 */
export function convertToLatex(text: string, options: ConversionOptions = {}): string {
  if (!text) return text;

  const { preserveMarkers = true } = options;

  // Protect markers trước khi xử lý
  const markers: string[] = [];
  let protectedText = text;

  if (preserveMarkers) {
    // Bảo vệ [IMAGE:...] markers
    protectedText = text.replace(/\[IMAGE:[^\]]+\]/g, (match) => {
      const index = markers.length;
      markers.push(match);
      return `IMAGEOHMARKER${index}END`;
    });
  }

  // Step 1: Loại bỏ artifacts từ Word
  let result = protectedText
    .replace(/▒/g, '') // Word equation placeholder
    .replace(/â–'/g, '') // Corrupted encoding
    .replace(/ã€–/g, '(') // Special brackets
    .replace(/ã€—/g, ')')
    .replace(/[〖〗]/g, '') // Remove these brackets entirely
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // Remove invisible formatting chars
    .replace(/[＾ˆ]/g, '^') // Normalize carets
    .replace(/∕/g, '/') // Normalize division slash
    .replace(/–/g, '-');

  // Step 2: Xử lý combining diacritics (overline, underline, etc)
  result = handleCombiningMarks(result);

  // Step 3: Chuyển đổi ký hiệu toán học
  result = convertMathSymbols(result);

  // Step 4: Xử lý superscript và subscript
  result = handleScriptsAndIndices(result);

  // Step 5: Xử lý căn bậc hai và phân số
  result = handleRootsAndFractions(result);

  // Step 6: Xử lý tổng, tích phân, giới hạn
  result = handleSummationsAndIntegrals(result);

  // Step 7: Xử lý ma trận và vector
  result = handleMatricesAndVectors(result);

  // Step 8: Làm sạch khoảng trắng thừa (chỉ chạy nếu không preserveWhitespace)
  if (!options.preserveWhitespace) {
    result = result
      .replace(/\s+/g, ' ')
      .replace(/\s*\\\s*/g, '\\') // Loại bỏ space quanh backslash
      .replace(/\s*\{\s*/g, '{')
      .replace(/\s*\}\s*/g, '}')
      .trim();
  }

  // Restore markers
  if (preserveMarkers) {
    markers.forEach((marker, index) => {
      result = result.replace(`IMAGEOHMARKER${index}END`, marker);
    });
  }

  return result;
}

/**
 * Xử lý combining diacritics (x̄, x̅, etc)
 */
function handleCombiningMarks(text: string): string {
  // Unicode combining overline: U+0305, U+0304
  // Space + overline chars: ̅, ̄, ¯
  return text
    // Combining overline (x followed by combining char)
    .replace(/([a-zA-Z0-9])\s*[\u0304\u0305\u0305]/g, '\\overline{$1\\vphantom{b}}')
    // Space + overline char
    .replace(/([a-zA-Z0-9])\s+[̅̄¯]/g, '\\overline{$1\\vphantom{b}}')
    // x Ì… pattern from Word
    .replace(/([a-zA-Z0-9])\s*Ì…/g, '\\overline{$1\\vphantom{b}}')
    // Combining tilde
    .replace(/([a-zA-Z0-9])[\u0303]/g, '\\tilde{$1}')
    // Combining hat
    .replace(/([a-zA-Z0-9])[\u0302]/g, '\\hat{$1}')
    // Combining dot above
    .replace(/([a-zA-Z0-9])[\u0307]/g, '\\dot{$1}')
    // Combining arrow above
    .replace(/([a-zA-Z0-9])[\u20D7]/g, '\\vec{$1}');
}

/**
 * Chuyển đổi ký hiệu toán học Unicode sang LaTeX
 */
function convertMathSymbols(text: string): string {
  const symbolMap: Record<string, string> = {
    // Greek letters
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
    'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
    'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    
    // Capital Greek
    'Α': 'A', 'Β': 'B', 'Γ': '\\Gamma', 'Δ': '\\Delta',
    'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Θ': '\\Theta',
    'Ι': 'I', 'Κ': 'K', 'Λ': '\\Lambda', 'Μ': 'M',
    'Ν': 'N', 'Ξ': '\\Xi', 'Ο': 'O', 'Π': '\\Pi',
    'Ρ': 'P', 'Σ': '\\Sigma', 'Τ': 'T', 'Υ': '\\Upsilon',
    'Φ': '\\Phi', 'Χ': 'X', 'Ψ': '\\Psi', 'Ω': '\\Omega',
    
    // Operators
    '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
    '∮': '\\oint', '∂': '\\partial', '∇': '\\nabla',
    
    // Relations
    '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv', '≤': '\\leq', '≥': '\\geq',
    '≪': '\\ll', '≫': '\\gg', '∈': '\\in', '∉': '\\notin', '⊂': '\\subset',
    '⊃': '\\supset', '⊆': '\\subseteq', '⊇': '\\supseteq', '∩': '\\cap',
    '∪': '\\cup', '∝': '\\propto', '∼': '\\sim', '≅': '\\cong',
    
    // Arrows
    '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow',
    '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
    '↑': '\\uparrow', '↓': '\\downarrow',
    
    // Logic
    '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists', '¬': '\\neg',
    '∧': '\\wedge', '∨': '\\vee', '⊕': '\\oplus', '⊗': '\\otimes',
    
    // Special
    '∞': '\\infty', '∅': '\\emptyset', '∋': '\\ni',
    '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div',
    '·': '\\cdot', '∙': '\\cdot', '√': '\\sqrt', '∛': '\\sqrt[3]', '∜': '\\sqrt[4]',
    '°': '^{\\circ}', '′': "'", '″': "''", '‰': '\\text{‰}',
    '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel',
    
    // Sets
    'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}',
    'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}',
  };

  let result = text;
  
  // Thay thế symbols, tránh thay thế nếu đã là LaTeX command
  Object.entries(symbolMap).forEach(([symbol, latex]) => {
    // Escape special regex chars
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Chỉ thay nếu không nằm trong \command{}
    result = result.replace(
      new RegExp(escapedSymbol, 'g'),
      latex
    );
  });

  return result;
}

/**
 * Xử lý superscript và subscript (Word linear format)
 */
function handleScriptsAndIndices(text: string): string {
  let result = text;

  // Word linear format: _(i=1) hoặc ^(n+1)
  result = result
    .replace(/_\(([^)]+)\)/g, '_{$1}')
    .replace(/\^\(([^)]+)\)/g, '^{$1}');

  // Simple scripts: x_i, x^2 -> x_{i}, x^{2}
  // Nhưng tránh thay nếu đã có braces
  result = result
    .replace(/([a-zA-Z0-9])_([a-zA-Z0-9]+)(?![}])/g, '$1_{$2}')
    .replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)(?![}])/g, '$1^{$2}');

  return result;
}

/**
 * Xử lý căn bậc hai và phân số
 */
function handleRootsAndFractions(text: string): string {
  let result = text;

  // √(...) hoặc √((...))
  result = result.replace(/√\(\(([^)]+)\)\)/g, '\\sqrt{$1}');
  result = result.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  result = result.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');

  // \sqrt ((content)) -> \sqrt{content}
  result = result.replace(/\\sqrt\s*\(\(([^)]+)\)\)/g, '\\sqrt{$1}');

  // Run Smart Fraction Parser
  result = convertFractions(result);
  
  return result;
}

/**
 * Logic convert fractions (similar to MathText.tsx)
 */
function convertFractions(normalized: string): string {
  let maxIterations = 100;
  let hasFraction = true;
  let result = normalized;
  
  while (hasFraction && maxIterations > 0) {
      maxIterations--;
      
      const slashIdx = result.indexOf('/');
      if (slashIdx === -1) {
          hasFraction = false;
          break;
      }

      // --- EXTRACT NUMERATOR (Left of slash) ---
      let leftEnd = slashIdx - 1;
      while (leftEnd >= 0 && /\s/.test(result[leftEnd])) leftEnd--; // Skip whitespace
      
      if (leftEnd < 0) break; // Invalid format

      let cursor = leftEnd;
      let numStart = -1;

      while (cursor >= 0) {
           const char = result[cursor];
           if (/\s/.test(char)) { cursor--; continue; }
           
           if (char === ')') {
               let balance = 1;
               let i = cursor - 1;
               while (i >= 0) {
                  if (result[i] === ')') balance++;
                  else if (result[i] === '(') balance--;
                  if (balance === 0) {
                      let prevCharIdx = i - 1;
                      while(prevCharIdx >= 0 && /\s/.test(result[prevCharIdx])) prevCharIdx--;
                      
                      if (prevCharIdx >= 0 && (result[prevCharIdx] === '^' || result[prevCharIdx] === '_')) {
                          cursor = prevCharIdx - 1;
                          continue;
                      } else {
                          numStart = i; cursor = -1;
                      }
                      break;
                  }
                  i--;
              }
              if (balance !== 0) { numStart = -1; break; }
           } else if (char === '}') {
               let balance = 1;
               let i = cursor - 1;
               while (i >= 0) {
                  if (result[i] === '}') balance++;
                  else if (result[i] === '{') balance--;
                  if (balance === 0) {
                      let prevCharIdx = i - 1;
                      while(prevCharIdx >= 0 && /\s/.test(result[prevCharIdx])) prevCharIdx--;
                      if (prevCharIdx >= 0 && (result[prevCharIdx] === '^' || result[prevCharIdx] === '_')) {
                          cursor = prevCharIdx - 1;
                          continue;
                      } else {
                          numStart = i; cursor = -1;
                      }
                      break;
                  }
                  i--;
              }
              if (balance !== 0) { numStart = -1; break; }
           } else if (/[a-zA-Z0-9\\]/.test(char)) { 
               let prevCharIdx = cursor - 1;
               while(prevCharIdx >= 0 && /\s/.test(result[prevCharIdx])) prevCharIdx--;

               if (prevCharIdx >= 0 && (result[prevCharIdx] === '^' || result[prevCharIdx] === '_')) {
                   cursor = prevCharIdx - 1;
                   continue; 
               } else {
                   let i = cursor;
                   while (i >= 0 && /[a-zA-Z0-9\\]/.test(result[i])) i--;
                   numStart = i + 1;
                   cursor = -1; 
                   break; 
               }
          } else { 
              break; 
          }
      }

      if (numStart === -1) {
           result = result.substring(0, slashIdx) + "__SLASH__" + result.substring(slashIdx + 1);
           continue;
      }

      // --- EXTRACT DENOMINATOR ---
      let rightStart = slashIdx + 1;
      while (rightStart < result.length && /\s/.test(result[rightStart])) rightStart++;
      if (rightStart >= result.length) break;

      let denEnd = -1;
      let dCursor = rightStart;
      
      if (result[dCursor] === '(') {
          let balance = 1;
          let i = dCursor + 1;
          while (i < result.length) {
              if (result[i] === '(') balance++;
              else if (result[i] === ')') balance--;
              if (balance === 0) { dCursor = i + 1; break; }
              i++;
          }
      } else if (result[dCursor] === '{') {
           let balance = 1;
           let i = dCursor + 1;
           while (i < result.length) {
              if (result[i] === '{') balance++;
              else if (result[i] === '}') balance--;
              if (balance === 0) { dCursor = i + 1; break; }
              i++;
          }
      } else {
          let i = dCursor;
          while (i < result.length && /[a-zA-Z0-9\\]/.test(result[i])) i++;
          dCursor = i;
      }
      
      while (true) {
          let next = dCursor;
          while (next < result.length && /\s/.test(result[next])) next++;
          if (next < result.length && (result[next] === '^' || result[next] === '_')) {
              dCursor = next + 1;
              while (dCursor < result.length && /\s/.test(result[dCursor])) dCursor++;
              if (dCursor >= result.length) break;
              if (result[dCursor] === '(' || result[dCursor] === '{') {
                   const opener = result[dCursor];
                   const closer = opener === '(' ? ')' : '}';
                   let balance = 1;
                   let i = dCursor + 1;
                   while (i < result.length) {
                      if (result[i] === opener) balance++;
                      else if (result[i] === closer) balance--;
                      if (balance === 0) { dCursor = i + 1; break; }
                      i++;
                  }
              } else {
                  if (/[a-zA-Z0-9]/.test(result[dCursor])) dCursor++;
              }
          } else {
              break; 
          }
      }
      
      denEnd = dCursor - 1;
      
      if (denEnd < rightStart) {
           result = result.substring(0, slashIdx) + "__SLASH__" + result.substring(slashIdx + 1);
           continue;
      }

      let nContent = result.substring(numStart, slashIdx).trim();
      let dContent = result.substring(rightStart, denEnd + 1).trim();
      
      if (nContent.startsWith('(') && nContent.endsWith(')')) {
           let balance = 0, wrapped = true;
           for(let k=0; k<nContent.length-1; k++) {
               if(nContent[k] === '(') balance++; else if(nContent[k] === ')') balance--;
               if(balance === 0) { wrapped = false; break; }
           }
           if (wrapped) nContent = nContent.slice(1, -1);
      }
      if (dContent.startsWith('(') && dContent.endsWith(')')) {
           let balance = 0, wrapped = true;
           for(let k=0; k<dContent.length-1; k++) {
               if(dContent[k] === '(') balance++; else if(dContent[k] === ')') balance--;
               if(balance === 0) { wrapped = false; break; }
           }
           if (wrapped) dContent = dContent.slice(1, -1);
      }

      const before = result.substring(0, numStart);
      const after = result.substring(denEnd + 1);
      
      result = `${before}\\frac{${nContent}}{${dContent}}${after}`;
  }

  result = result.replace(/__SLASH__/g, '/');
  return result;
}

/**
 * Xử lý tổng, tích phân, giới hạn
 */
function handleSummationsAndIntegrals(text: string): string {
  let result = text;

  // ∑_(i=1)^n -> \sum_{i=1}^{n}
  // Already handled by subscript/superscript converter, just ensure \sum exists
  
  // lim_(x->0) -> \lim_{x \to 0}
  result = result.replace(/lim_\{([^}]+)\}/g, '\\lim_{$1}');
  result = result.replace(/lim_\(([^)]+)\)/g, '\\lim_{$1}');
  
  // max, min, sup, inf
  result = result.replace(/\b(max|min|sup|inf)_\{([^}]+)\}/g, '\\$1_{$2}');
  result = result.replace(/\b(max|min|sup|inf)_\(([^)]+)\)/g, '\\$1_{$2}');

  return result;
}

/**
 * Xử lý ma trận và vector
 */
function handleMatricesAndVectors(text: string): string {
  // Placeholder for future matrix support
  // Word matrices are complex, usually pasted as tables
  return text;
}

/**
 * Detect if text likely contains math and should be wrapped
 */
export function shouldWrapInMath(text: string): boolean {
  const mathIndicators = [
    /\\[a-zA-Z]+/, // LaTeX commands
    /\^\{.+\}/, // Superscripts
    /_\{.+\}/, // Subscripts
    /\\frac/, // Fractions
    /\\sqrt/, // Roots
    /\\sum/, /\\prod/, /\\int/, // Operators
    /[α-ωΑ-Ω]/, // Greek letters
    /[∑∏∫∂∇]/, // Math operators
    /[≠≈≡≤≥]/, // Relations
  ];

  return mathIndicators.some(pattern => pattern.test(text));
}

/**
 * Wrap text in delimiters if it contains math
 */
export function wrapMathInDelimiters(text: string, inline: boolean = true): string {
  if (!text || text.includes('$')) return text;
  
  if (shouldWrapInMath(text)) {
    return inline ? `$${text}$` : `$$${text}$$`;
  }
  
  return text;
}

/**
 * Process user input - main entry point
 */
export function processMathInput(text: string, options: ConversionOptions = {}): string {
  if (!text) return text;

  // Nếu đã có delimiters, trả về nguyên
  if (text.includes('$$') || (text.match(/\$/g) || []).length >= 2) {
    return text;
  }

  // Convert to LaTeX
  const converted = convertToLatex(text, options);

  // Auto-wrap nếu cần
  if (options.autoWrap && shouldWrapInMath(converted)) {
    return wrapMathInDelimiters(converted);
  }

  return converted;
}