import mammoth from "mammoth";
import { parseDocsContent } from "./docsParser";

export interface WordParseResult {
  success: boolean;
  content?: string;
  images?: import('../types').ExtractedImage[];
  error?: string;
}

export async function parseWordFile(file: File): Promise<WordParseResult> {
  try {
    // Đọc file Word
    const arrayBuffer = await file.arrayBuffer();

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

    // Chuyển đổi Word sang HTML với image converter
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage }
    );

    if (result.messages.length > 0) {
      console.warn("Word parsing warnings:", result.messages);
    }

    // Extract text từ HTML và thay thế image tags bằng markers
    const htmlContent = result.value;
    
    // Parse HTML và extract text, giữ lại image markers và line breaks
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Replace img tags with [IMAGE] markers
    const imgTags = doc.querySelectorAll('img');
    imgTags.forEach(img => {
      const marker = doc.createTextNode('\n[IMAGE]\n');
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
        if (['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          if (tagName === 'br') {
            plainText += '\n';
          } else if (plainText && !plainText.endsWith('\n')) {
            plainText += '\n';
          }
        }
        
        // Recursively process children
        node.childNodes.forEach(child => walk(child));
        
        // Add trailing newline for block elements
        if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
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
