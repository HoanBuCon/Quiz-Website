import mammoth from "mammoth";

export interface WordParseResult {
  success: boolean;
  content?: string;
  error?: string;
}

export async function parseWordFile(file: File): Promise<WordParseResult> {
  try {
    // Đọc file Word
    const arrayBuffer = await file.arrayBuffer();

    // Chuyển đổi Word sang HTML
    const result = await mammoth.extractRawText({ arrayBuffer });

    if (result.messages.length > 0) {
      console.warn("Word parsing warnings:", result.messages);
    }

    // Lấy text thuần túy từ HTML
    const plainText = result.value;

    // Làm sạch text
    const cleanedText = cleanWordText(plainText);

    return {
      success: true,
      content: cleanedText,
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
      // Thay thế các ký tự bullet points bằng A. B. C. D.
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
  const errors: string[] = [];
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let hasQuestions = false;
  let currentQuestionId = "";
  let hasValidQuestion = false;
  let questionCount = 0;
  let totalLines = lines.length;
  // let hasIdFormat = false; // Không bắt buộc nữa
  let hasQuestionFormat = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("ID:")) {
      // hasIdFormat = true;
      const idMatch = line.match(/ID:\s*(\d+)/);
      if (idMatch) {
        currentQuestionId = idMatch[1];
        hasQuestions = true;
      }
    } else if (line.startsWith("Câu") && line.includes(":")) {
      hasQuestionFormat = true;
      hasValidQuestion = true;
      questionCount++;
      // Reset current ID if we want to track per question, but mostly just checking existence here
      if (!currentQuestionId) {
         // Just a marker that we found questions without ID (acceptable now)
      }
    } 
    // Check for other types (just to ensure file isn't garbage)
    else if (line.startsWith("result:")) {
      // Fill-in or Group
    }
    else if (line.startsWith("{")) {
       // Composite start
    }
  }

  // Thông báo lỗi chi tiết với hướng dẫn
  if (!hasQuestionFormat && !hasQuestions) {
    errors.push(`Không tìm thấy câu hỏi hợp lệ trong file. Vui lòng sử dụng định dạng "Câu n: ..."`);
  } else if (questionCount === 0 && !hasQuestions) {
    errors.push(
      `Không tìm thấy câu hỏi nào trong file. File có ${totalLines} dòng.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
