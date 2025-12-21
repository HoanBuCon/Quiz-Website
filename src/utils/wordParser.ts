import mammoth from "mammoth";
import JSZip from "jszip";
import { parseDocsContent } from "./docsParser";

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
      const zip = new JSZip();
      await zip.loadAsync(arrayBuffer);

      // Read document.xml
      const docXmlEntry = zip.file("word/document.xml");
      if (docXmlEntry) {
        const docXml = await docXmlEntry.async("string");
        const parser = new DOMParser();
        const doc = parser.parseFromString(docXml, "application/xml");

        // Find all Math elements (m:oMath)
        // We use getElementsByTagNameNS if possible, or just tag name with prefix
        // Browsers might require namespaces, but "m:oMath" usually works in simple XML parse
        let mathNodes = Array.from(doc.getElementsByTagName("m:oMath"));
        
        // Also handle m:oMathPara (paragraph math), typically contains m:oMath
        // If we process m:oMath, we usually cover what's inside m:oMathPara.
        // However, we might want to ensure newlines for paragraphs.
        
        let modified = false;

        if (mathNodes.length > 0) {
          console.log(`Found ${mathNodes.length} math formulas. Converting to LaTeX...`);
          
          mathNodes.forEach((node) => {
            try {
              const latex = convertOMMLToLatex(node);
              if (latex) {
                // Create a new Text Run <w:r><w:t>...</w:t></w:r>
                const run = doc.createElement("w:r");
                const textNode = doc.createElement("w:t");
                // Preserve whitespace
                textNode.setAttribute("xml:space", "preserve");
                textNode.textContent = ` ${latex} `; // Add padding spaces
                
                run.appendChild(textNode);
                
                // Replace the math node with the text run
                node.parentNode?.replaceChild(run, node);
                modified = true;
              }
            } catch (err) {
              console.warn("Failed to convert math node", err);
            }
          });
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
      console.warn("JSZip pre-processing failed, falling back to original content:", e);
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
        return {
          src: `[IMAGE:${imageId}]` // Marker với ID để tracking
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
      console.warn("Word parsing warnings:", result.messages);
    }

    // Extract text từ HTML và thay thế image tags bằng markers
    const htmlContent = result.value;
    
    // Parse HTML và extract text, giữ lại image markers và line breaks
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Replace img tags with [IMAGE:id] markers
    const imgTags = doc.querySelectorAll('img');
    imgTags.forEach(img => {
      // Mammoth puts the return value of convertImage into the src attribute
      // So src should be "[IMAGE:id]"
      const markerText = img.getAttribute('src') || '[IMAGE]';
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
    const cleanedText = cleanWordText(plainText);

    console.log(`✓ Extracted ${extractedImages.length} images from Word document`);

    return {
      success: true,
      content: cleanedText,
      images: extractedImages.length > 0 ? extractedImages : undefined,
    };
  } catch (error) {
    console.error("Error parsing Word file:", error);
    return {
      success: false,
      error: `Không thể đọc file Word: ${
        error instanceof Error ? error.message : "Lỗi không xác định"
      }`,
    };
  }
}

function cleanWordText(text: string): string {
  // Loại bỏ các ký tự đặc biệt và định dạng không cần thiết
  // GIỐNG HỆT VỚI docsParser.ts để đảm bảo format nhất quán
  return (
    text
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
      .trim()
  );
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
      
    // Superscript
    case "sSup":
      const supE = findChild(element, "e");
      const sup = findChild(element, "sup");
      return `{${convertOMMLToLatex(supE!)}^{${convertOMMLToLatex(sup!)}}}`;
      
    // Subscript
    case "sSub":
      const subE = findChild(element, "e");
      const sub = findChild(element, "sub");
      return `{${convertOMMLToLatex(subE!)}_{${convertOMMLToLatex(sub!)}}}`;
      
    // SubSup
    case "sSubSup":
      const subSupE = findChild(element, "e");
      const subS = findChild(element, "sub");
      const supS = findChild(element, "sup");
      return `{${convertOMMLToLatex(subSupE!)}_{${convertOMMLToLatex(subS!)}}^{${convertOMMLToLatex(supS!)}}}`;
      
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
       return element.textContent || "";
       
    default:
       // Fallback: traverse children
       if (node.hasChildNodes()) {
           return getChildrenText(element);
       }
       // Text Node
       if (node.nodeType === 3) {
           return node.textContent || "";
       }
       return "";
  }
}
