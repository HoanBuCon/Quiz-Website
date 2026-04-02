const { GoogleGenAI, Type } = require("@google/genai");
const fs = require('fs');
const mammoth = require('mammoth');

const getLanguageInstruction = (lang) => {
    const languageName = lang === 'vi' ? 'Vietnamese' : 'English';
    return `CRITICAL: You MUST generate your entire response, including all text, questions, options, answers, and explanations, exclusively in ${languageName}.`;
};

const createGroundingInstruction = (groundingContent, integrateGeneralAI, forExplanationOnly = false) => {
  const target = forExplanationOnly ? 'explanations' : 'answer and explanation';

  if (integrateGeneralAI === false) {
    return `
CRITICAL INSTRUCTION: You MUST base your ${target} STRICTLY on the following 'Database Knowledge' provided. Do not use external information. If the context for an answer isn't in the database, state that the explanation is based on the source document.
--- DATABASE KNOWLEDGE START ---
${groundingContent}
--- DATABASE KNOWLEDGE END ---
`;
  }
  // True or undefined
  return `
INSTRUCTION: When creating the ${target}, you should prioritize information from the 'Database Knowledge' provided below. However, you are encouraged to supplement this with your general knowledge to provide a more comprehensive and well-rounded response where it adds value.
--- DATABASE KNOWLEDGE START ---
${groundingContent}
--- DATABASE KNOWLEDGE END ---
`;
};

const extractJson = (text) => {
    const trimmedText = text.trim();
    const match = trimmedText.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonText = match && match[1] ? match[1].trim() : trimmedText;

    try {
        return JSON.parse(jsonText);
    } catch (e) {
        console.warn("Initial JSON parsing failed. Attempting to clean and re-parse.", e);
        
        // Attempt to fix common errors like trailing commas
        const cleanedText = jsonText.replace(/,\s*([}\]])/g, '$1');

        try {
            return JSON.parse(cleanedText);
        } catch (e2) {
            console.error("Failed to parse JSON even after cleanup", e2, jsonText);
            const err = e2;
            if (err.message && (err.message.includes("Unterminated string") || err.message.includes("Unexpected end of JSON input"))) {
                 throw new Error("The AI's response was cut off, resulting in incomplete data. This can happen with very large documents or complex requests. Please try again, perhaps with a smaller document.");
            }
            throw new Error("AI returned a malformed JSON response. No valid JSON found.");
        }
    }
};

const getExtractionPrompt = (
    selectedTypes,
    lang,
    groundingInstruction,
    searchInstruction,
    explanationInstruction
) => {
    // Instructions for each question type
    const typeInstructions = {
        'multiple-choice': `
**For 'multiple-choice' questions:**
1.  Identify the main question text and any context passage.
2.  Identify ALL provided options.
3.  Identify ALL correct answers. Some questions have multiple correct answers.
4.  Assemble the JSON object:
    - \`passage\`: (Optional) The context passage.
    - \`question\`: The main question text.
    - \`type\`: "multiple-choice"
    - \`options\`: Array of strings for ALL options.
    - \`answer\`: Array of strings for ALL correct answer(s). Each MUST match an option.
`,
        'multi-true-false': `
**For 'multi-true-false' questions:**
1.  Identify the main instruction and the list of statements (often in {} or numbered).
2.  Assemble the JSON object:
    - \`question\`: The main instruction.
    - \`type\`: "multi-true-false"
    - \`subQuestions\`: Array of \`{ statement: string, answer: 'True' | 'False' }\`.
`,
        'drag': `
**For 'drag' (Kéo thả / Ghép nối) questions:**
1.  Identify the matching instruction and the items/targets (often in tables or lists).
2.  Assemble the JSON object:
    - \`question\`: The instruction text.
    - \`type\`: "drag"
    - \`options\`: { "items": ["Item 1", "Item 2"], "targets": ["Category A", "Category B"] }
    - \`answer\`: { "Item 1": "Category A", "Item 2": "Category B" }
`,
        'short-answer': `
**For 'short-answer' questions:**
1.  Identify the question and the concise correct answer(s).
2.  Assemble the JSON object:
    - \`question\`: The question text.
    - \`type\`: "short-answer"
    - \`answer\`: Array of strings for correct answer(s).
`
    };

    const requestedTypeInstructions = selectedTypes.map(type => typeInstructions[type]).join('\n');

    return `
    You are an AI assistant specialized in creating quizzes from documents. Your task is to analyze the provided content and extract questions based on a specific set of types, while intelligently filtering out unsuitable question formats like essays.

    ${getLanguageInstruction(lang)}
    ${groundingInstruction}
    ${searchInstruction}
    
    You will be provided with document content, which may include text and images.
    Your goal is to parse this content and convert ANY questions that match the requested types into a structured JSON format.

    --- INTELLIGENT QUESTION FILTERING (CRITICAL) ---
    Your primary goal is to create an interactive quiz. Long-form essay questions ("Tự luận") are NOT suitable and MUST BE IGNORED.
    1.  **Analyze Document Structure:** Look for section headers like "I. TRẮC NGHIỆM", "II. TỰ LUẬN", "PART 1: MULTIPLE CHOICE", "PART 2: ESSAY".
        -   Prioritize extracting questions ONLY from sections marked as multiple-choice or objective questions ("TRẮC NGHIỆM", "TN", "MULTIPLE CHOICE").
        -   You MUST explicitly IGNORE all questions from sections marked as "TỰ LUẬN", "ESSAY", "WRITTEN RESPONSE".
    2.  **Differentiate "Short Answer" from "Essay":** This is crucial.
        -   **VALID "short-answer"**: A question expecting a brief, factual response like a single word, a number ("đáp số"), a date, or filling in a blank.
        -   **INVALID "Tự luận" (Essay - IGNORE THIS TYPE)**: A question asking the user to "explain", "describe", "prove", "analyze", "write a paragraph about", or any prompt requiring a multi-sentence text answer ("đáp chữ"). Do NOT extract these.
    
    --- REQUESTED QUESTION TYPES ---
    You must only extract questions that fit the following formats AND pass the filtering rules above:
    ${requestedTypeInstructions}
    
    --- EXPLANATION GENERATION RULES ---
    ${explanationInstruction}
    ${selectedTypes.includes('multi-true-false') && explanationInstruction.length > 0 ? `
    **For 'multi-true-false' explanations (ABSOLUTELY CRITICAL):**
    The \`explanation\` field for this question type MUST follow a strict format. It MUST be a single string containing a numbered list, where each number corresponds to a sub-question.
    - Each item in the list MUST start with the word '${lang === 'vi' ? 'Đúng' : 'True'}' or '${lang === 'vi' ? 'Sai' : 'False'}'.
    - This MUST be followed by "${lang === 'vi' ? 'vì' : 'because'}".
    - This MUST be followed by the reasoning for that specific statement.
    - DO NOT write a single paragraph. Each statement must have its own numbered entry in the explanation.

    **Correct Format Example (${lang === 'vi' ? 'Vietnamese' : 'English'}):**
    \`\`\`
    1. ${lang === 'vi' ? 'Sai vì' : 'False because'} [reasoning for statement 1].
    2. ${lang === 'vi' ? 'Đúng vì' : 'True because'} [reasoning for statement 2].
    3. ${lang === 'vi' ? 'Sai vì' : 'False because'} [reasoning for statement 3].
    \`\`\`
    ` : ''}

    --- OUTPUT FORMAT ---
    Your response MUST be a single JSON array of question objects.
    Each object in the array represents one question and must contain:
    - \`question\`: The question text.
    - \`type\`: One of ${selectedTypes.map(t => '"' + t + '"').join(', ')}.
    - \`explanation\`: A string with the explanation.
    - \`passage\`: (Optional) The context passage associated with the question.
    - \`image\`: (Optional) If an image is associated with a question, include the placeholder string for it (e.g., "[Image 1]").
    - Other fields specific to the question type (e.g., \`options\`, \`answer\`, \`subQuestions\`).
    
    --- CRITICAL INSTRUCTIONS ---
    1.  **Filter First:** Apply the "INTELLIGENT QUESTION FILTERING" rules BEFORE attempting to match questions to the requested types.
    2.  **Analyze Carefully:** Read the entire document content to understand the context.
    3.  **Match Strictly:** Only extract questions that perfectly match one of the requested type definitions. If a question is ambiguous or doesn't fit, ignore it.
    4.  **Preserve Content:** The text for questions, options, answers, and statements must be preserved exactly as it appears in the source document.
    5.  **Handle Images:** If you see an image placeholder like "[Image 1]", and it's clearly part of a question, include that placeholder string in the 'image' field of the corresponding question object.
    6.  **JSON Only:** Your entire output must be a single valid JSON array. Do not include any introductory text, markdown formatting, or explanations outside of the JSON structure.
  `;
};

const getTheoryGenerationPrompt = (
    config,
    groundingInstruction,
    searchInstruction,
    explanationInstruction
) => {
    
    // --- Build Detailed Question & Difficulty Count Instruction ---
    let overallInstruction = 'You are tasked with generating a specific set of questions. Here is the breakdown:\\n';
    let hasInstructions = false;

    for (const type of config.selectedTypes) {
        let typeInstruction = '';
        const totalMode = config.questionCountModes[type];
        const totalCount = config.customQuestionCounts[type] || 0;
        const selectedDifficulties = Array.from(config.difficultyLevels[type] || []);

        if (selectedDifficulties.length === 0) continue; // Skip if no difficulties are selected for this type

        hasInstructions = true;
        typeInstruction += `\\nFor question type '${type}':\\n`;

        if (totalMode === 'custom' && totalCount > 0) {
            typeInstruction += `- You MUST generate a total of EXACTLY ${totalCount} question(s) of this type.\\n`;
        } else { // Auto total count
            typeInstruction += `- You must intelligently determine a reasonable total number of questions for this type based on the source material.\\n`;
        }

        const difficultyDetails = [];
        for (const level of selectedDifficulties) {
            const diffMode = config.difficultyCountModes[type]?.[level];
            const diffCount = config.difficultyCounts[type]?.[level] || 0;
            if (diffMode === 'custom' && diffCount > 0) {
                difficultyDetails.push(`EXACTLY ${diffCount} at the '${level}' level`);
            } else { // Auto difficulty count
                difficultyDetails.push(`an appropriate number at the '${level}' level`);
            }
        }
        typeInstruction += `- The difficulty distribution for these questions MUST be as follows: ${difficultyDetails.join(', ')}.\\n`;
        overallInstruction += typeInstruction;
    }

    if (!hasInstructions) {
        overallInstruction = `The user's configuration is empty. As a fallback, please generate 5 diverse questions based on the content, covering at least two different difficulty levels.`;
    }

    const difficultyDefinitions = config.lang === 'vi' ? `
--- ĐỊNH NGHĨA CÁC MỨC ĐỘ NHẬN THỨC (BẮT BUỘC TUÂN THỦ) ---
Bạn PHẢI tạo ra các câu hỏi tuân thủ nghiêm ngặt các định nghĩa sau:

1.  **Nhận biết (recognition):**
    *   **Mục tiêu:** Kiểm tra trí nhớ của học sinh về dữ liệu, số liệu, định nghĩa, tên tuổi, địa điểm.
    *   **Yêu cầu:** Học sinh chỉ cần nhận biết, nhắc lại, hoặc mô tả lại nội dung đã học. Các câu hỏi áp dụng trực tiếp kiến thức để giải quyết các tình huống quen thuộc.
    *   **Hành động:** Tạo câu hỏi yêu cầu "nhận diện", "mô tả", "liệt kê", "kể lại".

2.  **Thông hiểu (comprehension):**
    *   **Mục tiêu:** Kiểm tra cách học sinh liên hệ, kết nối các dữ liệu, định nghĩa.
    *   **Yêu cầu:** Học sinh phải kết nối và sắp xếp các nội dung đã học để giải quyết vấn đề tương tự. Câu hỏi tập trung vào khả năng tổ chức thông tin.
    *   **Hành động:** Tạo câu hỏi yêu cầu "so sánh", "phân biệt", "liên kết các khái niệm", "giải thích", "diễn giải".

3.  **Vận dụng (application):**
    *   **Mục tiêu:** Kiểm tra khả năng áp dụng kiến thức vào hoàn cảnh và điều kiện mới.
    *   **Yêu cầu:** Học sinh phải vận dụng kiến thức để giải quyết vấn đề mới hoặc đưa ra phản hồi hợp lý. Câu hỏi nhấn mạnh khả năng ứng dụng linh hoạt, đánh giá, và cải tiến.
    *   **Hành động:** Tạo câu hỏi yêu cầu "phân tích một tình huống", "đưa ra giải pháp", "tạo ra một dự án", "áp dụng quy luật vào thực tiễn". Tạo ra các tình huống mới, khác với những gì đã học.
` : `
--- COGNITIVE DIFFICULTY LEVEL DEFINITIONS (MUST BE FOLLOWED) ---
You MUST generate questions that strictly adhere to the following definitions:

1.  **Recognition:**
    *   **Objective:** To test the student's memory of data, figures, definitions, names, places, etc.
    *   **Requirement:** The student is required to understand and reproduce learned content at a basic level. Questions and exercises aim at the ability to identify and describe information, then apply it directly to solve familiar situations and problems in learning.
    *   **Action:** Create questions that ask to "identify," "describe," "list," "recall."

2.  **Comprehension:**
    *   **Objective:** To test how students relate and connect data, figures, names, places, definitions, etc.
    *   **Requirement:** At this level, students are challenged more by being asked to connect and arrange learned content to solve problems with similar content. Exercises focus on the ability to organize information and apply knowledge to provide coherent solutions. For example, questions should require comparison and connection between important concepts learned and recognition of their similarities and differences.
    *   **Action:** Create questions that ask to "compare," "contrast," "connect concepts," "explain," "interpret."

3.  **Application:**
    *   **Objective:** To test the ability to apply data, concepts, rules, methods, etc., to new circumstances and conditions.
    *   **Requirement:** At the highest level, the test challenges students by asking them to apply the knowledge they have learned to solve new problems or provide reasonable responses in learning and life. Questions and exercises at this level emphasize the ability of flexible application and the ability to evaluate and improve. For example, analyzing a situation to propose solutions or creating a unique project.
    *   **Action:** Create questions that require "analyzing a situation," "proposing a solution," "creating a project," "applying rules to a practical scenario." Create new situations different from what was taught in the lesson.
`;

    const shortAnswerInstruction = config.lang === 'vi' ? `
--- HƯỚNG DẪN TẠO CÁC LOẠI CÂU HỎI ---
Khi tạo câu hỏi, hãy tuân thủ các quy tắc cụ thể sau cho từng loại:

**Đối với câu hỏi 'trả lời ngắn' (CỰC KỲ QUAN TRỌNG):**
Bạn BẮT BUỘC phải tạo ra các câu hỏi chỉ yêu cầu một câu trả lời rất ngắn gọn, thực tế và súc tích. KHÔNG tạo các câu hỏi yêu cầu trả lời bằng cả câu hoặc giải thích.
Các ví dụ HỢP LỆ bao gồm:
- Một câu hỏi yêu cầu tính toán mà đáp án là một con số duy nhất (ví dụ: "5 + 3 bằng mấy?").
- Một câu hỏi có thể được trả lời bằng "Có" hoặc "Không".
- Một câu hỏi yêu cầu một từ khóa hoặc thuật ngữ kỹ thuật cốt lõi duy nhất (ví dụ: "Cơ quan nào là nhà máy năng lượng của tế bào?").
Trường 'answer' cho loại câu hỏi này CHỈ nên chứa câu trả lời ngắn, trực tiếp đó (ví dụ: "8", "Có", "Ty thể").
` : `
--- QUESTION TYPE GENERATION GUIDELINES ---
When generating questions, adhere to these specific rules for each type:

**For 'short-answer' questions (ABSOLUTELY CRITICAL):**
You MUST generate questions that expect a very brief, factual, and concise answer. Do NOT create questions that require sentences or explanations.
VALID examples include:
- A question requiring a calculation where the answer is a single number (e.g., "What is 5 + 3?").
- A question that can be answered with "Yes" or "No".
- A question asking for a single, core keyword or technical term (e.g., "What is the powerhouse of the cell?").
The 'answer' field for this type should ONLY contain that short, direct answer (e.g., "8", "Yes", "Mitochondria").
`;

    return `
    You are an expert educator and AI assistant with advanced reasoning capabilities. Your primary role is to act as a thoughtful teacher creating a high-quality quiz from a theoretical document (text, images, audio). The goal is to help a user learn, review, and reinforce their knowledge according to specific cognitive difficulty levels.

    ${getLanguageInstruction(config.lang)}
    ${groundingInstruction}
    ${searchInstruction}

    --- CORE PHILOSOPHY: CREATE A GENUINE, DIFFERENTIATED LEARNING TOOL ---
    1.  **Think Like a Teacher:** Before generating any question, ask yourself: "Does this question effectively test understanding at the requested difficulty level? How can I frame it to make the user think and recall information appropriately?"
    2.  **Mandatory Answers:** For EVERY single question you generate, you MUST provide the correct 'answer'. This is non-negotiable.
    3.  **Adhere to Difficulty Levels:** You must strictly follow the definitions of the cognitive levels provided below. Each generated question must be tagged with its corresponding difficulty level.
    4.  **Be Flexible and Creative:** Do not be repetitive. For questions within the same difficulty level, vary the phrasing and the angle of the question. Your goal is to test the same concept in multiple ways to ensure a robust and flexible understanding from the learner.

    ${difficultyDefinitions}
    ${shortAnswerInstruction}

    --- RULES FOR USING THE \`passage\` FIELD (CRITICAL) ---
    1.  **The \`passage\` field is OPTIONAL and should be used RARELY.** Most questions should NOT have a passage. The goal is to test the user's memory, not their reading comprehension of a provided text.
    2.  **USE a \`passage\` ONLY when the question is impossible to answer without a specific piece of data, a quote, or a diagram description from the source text.**
    3.  **CRITICAL - AVOID GIVEAWAYS:** If you use a passage, you MUST ensure it does NOT contain the direct answer. The passage provides necessary context, not the solution.

    --- TASK ---
    1.  Thoroughly analyze the provided document content.
    2.  Generate a series of high-quality questions based on the user's specifications for question types and difficulty levels.
    3.  Strictly adhere to all formatting and content rules below.

    --- NUMBER, TYPE, AND DIFFICULTY OF QUESTIONS ---
    ${overallInstruction}
    
    --- EXPLANATION GENERATION RULES ---
    ${explanationInstruction}
    ${config.selectedTypes.includes('multi-true-false') && config.shouldGenerateExplanations ? `
    **For 'multi-true-false' explanations (ABSOLUTELY CRITICAL):**
    The \`explanation\` field for this question type MUST follow a strict format. It MUST be a single string containing a numbered list, where each number corresponds to a sub-question.
    - Each item MUST start with '${config.lang === 'vi' ? 'Đúng' : 'True'}' or '${config.lang === 'vi' ? 'Sai' : 'False'}', followed by "${config.lang === 'vi' ? 'vì' : 'because'}".
    - Each item MUST contain the reasoning for that specific statement.
    ` : ''}

    --- OUTPUT FORMAT ---
    Your response MUST be a single JSON array of question objects. Each object represents one question and must contain:
    - \`question\`: The question text.
    - \`type\`: One of ${config.selectedTypes.map(t => '"' + t + '"').join(', ')}.
    - \`difficulty\`: The cognitive level of the question. Must be one of 'recognition', 'comprehension', or 'application'. This field is MANDATORY.
    - \`explanation\`: A string with the explanation.
    - \`answer\`: The correct answer. This field is MANDATORY for 'multiple-choice' and 'short-answer'.
    - \`passage\`: (OPTIONAL, use sparingly) A quote or summary from the document for context, NOT the answer.
    - \`options\`: For 'multiple-choice' only. An array of strings.
    - \`subQuestions\`: For 'multi-true-false' only. This MUST be an array of objects.
        **CRITICAL REQUIREMENT:** Each object in the \`subQuestions\` array MUST contain TWO fields:
        1. \`statement\`: A non-empty string containing the full text of the statement to be evaluated.
        2. \`answer\`: The string 'True' or 'False'.
    
    --- FINAL CHECK ---
    Before outputting, review your generated JSON. Does every question have a correct answer and a difficulty level? Are the \`subQuestions\` correctly formatted with non-empty statements? Have you used the \`passage\` field appropriately and sparingly?
  `;
};

/**
 * Builds a prompt for THEORY mode that asks Gemini to output questions
 * directly in the application's standard text format (not JSON).
 */
const getTheoryTextFormatPrompt = (config, groundingInstruction, searchInstruction) => {
    const lang = config.lang || 'vi';
    const selectedTypes = config.selectedTypes || ['multiple-choice'];

    // Build a count instruction similar to getTheoryGenerationPrompt
    let questionCountInstruction = '';
    for (const type of selectedTypes) {
        const totalMode = config.questionCountModes?.[type];
        const totalCount = config.customQuestionCounts?.[type] || 0;
        if (totalMode === 'custom' && totalCount > 0) {
            questionCountInstruction += `\n- For type '${type}': generate EXACTLY ${totalCount} questions.`;
        } else {
            questionCountInstruction += `\n- For type '${type}': generate a reasonable number of questions based on the material.`;
        }
    }

    const typeList = selectedTypes.join(', ');

    return `
You are an expert quiz creator. Read the provided document content carefully, then generate a set of questions in the EXACT text format described below.

${getLanguageInstruction(lang)}
${groundingInstruction}
${searchInstruction}

--- QUESTION TYPES TO GENERATE ---
Only create questions of these types: ${typeList}
${questionCountInstruction}

--- MANDATORY OUTPUT FORMAT (COPY THIS EXACTLY) ---
Each question MUST be separated by a blank line. Follow these rules strictly:

1. **Multiple choice (1 correct answer)**:
Câu N: [Question text]

*A. [Correct option]

B. [Wrong option]

C. [Wrong option]

D. [Wrong option]

Giải thích: [Explanation of why the answer is correct]

2. **Multiple choice (multiple correct answers)**:
Câu N: [Question text]

*A. [Correct option]

B. [Wrong option]

*C. [Correct option]

D. [Wrong option]

Giải thích: [Explanation]

3. **Short answer / fill in the blank**:
Câu N: [Question text]

result: "[Answer 1]", "[Answer 2 if multiple accepted]"

Giải thích: [Explanation]

4. **True/False group (multi-true-false)** — only use if 'multi-true-false' is in the type list:
Câu N: [Main instruction / question stem]

{
Câu 1: [Statement 1]
*A. Đúng
B. Sai

Câu 2: [Statement 2]
A. Đúng
*B. Sai
}

Giải thích: [Numbered explanation per statement]

5. **Drag and Drop (drag)** — only use if 'drag' is in the type list:
Câu N: [Instruction for matching/grouping]

result: ["Item 1", "Item 2", "Item 3", "Item 4"]
group: ("Group A": ["Item 1", "Item 2"]), ("Group B": ["Item 3"])

Giải thích: [Explanation of the correct mapping]

--- RULES ---
1.  Mark correct answer options with a * prefix (e.g. *A., *B.).
2.  Each question starts with "Câu N:" where N is the sequential number.
3.  Include a "Giải thích:" line after EVERY question.
4.  Do NOT output JSON. Output ONLY the plain text format above.
5.  Use blank lines between options and between questions for readability.
6.  Do NOT add any introductory or closing text outside the question format.
`;
};

const generateQuiz = async (config) => {
    let aiClient;
    try {
        console.log("Initializing Gemini with API key:", process.env.API_KEY || process.env.GEMINI_API_KEY ? "EXISTS" : "MISSING");
        aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });
    } catch (error) {
        console.error("Failed to initialize Google Gen AI:", error);
        throw new Error("Failed to initialize AI. Please check your API_KEY.");
    }
    
    const { 
      fileParts, selectedTypes, modelName, lang, groundingContent, 
      integrateGeneralAI, shouldGenerateExplanations = true, useWebSearch = false,
      generationMode, files
    } = config;
  
    let searchInstruction = ''; // We skip web search in backend for now to reduce latency
    
    let groundingInstruction = '';
    if (shouldGenerateExplanations && groundingContent) {
      groundingInstruction = createGroundingInstruction(groundingContent, integrateGeneralAI, true);
    }
  
    const explanationInstruction = shouldGenerateExplanations
      ? `For EACH question, you MUST provide a clear and concise \`explanation\` for why the correct answer is correct.`
      : `You MUST set the \`explanation\` field to an empty string "" for all questions.`;
  
    const prompt = generationMode === 'extract'
      ? getExtractionPrompt(selectedTypes, lang, groundingInstruction, searchInstruction, explanationInstruction)
      : getTheoryTextFormatPrompt(config, groundingInstruction, searchInstruction);
  
    let contentsParts = [];
    
    if (files && files.length > 0) {
        try {
            console.log("Processing " + files.length + " files...");
            for (const file of files) {
                // If it's docx or txt, read locally
                if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    const result = await mammoth.extractRawText({ path: file.path });
                    contentsParts.push({ text: `[Content of uploaded document ${file.originalname}]:\n${result.value}` });
                    console.log("Extracted DOCX locally.");
                } else if (file.mimetype === 'text/plain') {
                    const text = fs.readFileSync(file.path, 'utf8');
                    contentsParts.push({ text: `[Content of uploaded text ${file.originalname}]:\n${text}` });
                    console.log("Extracted TXT locally.");
                } else {
                    // For PDF and other supported types, use Gemini File API
                    const uploadResult = await aiClient.files.upload({
                        file: file.path,
                        mimeType: file.mimetype,
                    });
                    console.log("Uploaded file to Gemini:", uploadResult.uri);
                    contentsParts.push({ fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } });
                }
            }
        } catch (error) {
            console.error("Error processing file:", error);
            throw new Error("Failed to process file: " + error.message);
        }
    } else if (fileParts) {
         contentsParts = [...fileParts];
    }
    
    contentsParts.push({ text: prompt });

    console.log("Generating content with prompt length:", prompt.length);

    try {
        const response = await aiClient.models.generateContent({
        model: modelName || 'gemini-flash-latest', 
        contents: contentsParts,
        config: {
            thinkingConfig: { thinkingBudget: 8192 }
        }
        });
        
        console.log("Generation successful.");

        if (generationMode === 'theory') {
            // Return raw text for theory mode — frontend will use it directly in the editor
            return { textContent: response.text };
        }
        return { questions: extractJson(response.text) };
    } catch (error) {
        console.error("Error generating content:", error);
        throw error;
    }
};

module.exports = {
    generateQuiz
};
