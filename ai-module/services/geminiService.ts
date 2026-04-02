import { GoogleGenAI, Part, FunctionDeclaration, Type } from "@google/genai";
// FIX: Import 'GenerationMode' to resolve 'Cannot find name' error.
import { QuizQuestion, SelectableQuestionType, SubQuestion, Language, GeminiModel, GenerationMode, CustomQuestionCountModes, CustomQuestionCounts, DifficultyLevels, DifficultyCountModes, DifficultyCounts, DifficultyLevel } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

interface GenerateQuizConfig {
    fileParts: Part[];
    selectedTypes: SelectableQuestionType[];
    modelName: GeminiModel;
    lang: Language;
    groundingContent?: string;
    integrateGeneralAI?: boolean;
    shouldGenerateExplanations?: boolean;
    useWebSearch?: boolean;
    generationMode: GenerationMode;
    questionCountModes: CustomQuestionCountModes;
    customQuestionCounts: CustomQuestionCounts;
    difficultyLevels: DifficultyLevels;
    difficultyCountModes: DifficultyCountModes;
    difficultyCounts: DifficultyCounts;
}

const getLanguageInstruction = (lang: Language): string => {
    const languageName = lang === 'vi' ? 'Vietnamese' : 'English';
    return `CRITICAL: You MUST generate your entire response, including all text, questions, options, answers, and explanations, exclusively in ${languageName}.`;
};

const createGroundingInstruction = (groundingContent: string, integrateGeneralAI?: boolean, forExplanationOnly = false): string => {
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

/**
 * Extracts a JSON object from a string, handling cases where it's wrapped in markdown.
 * @param text The string to extract JSON from.
 * @returns The parsed JSON object.
 */
const extractJson = (text: string): any => {
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
            const err = e2 as Error;
            if (err.message.includes("Unterminated string") || err.message.includes("Unexpected end of JSON input")) {
                 throw new Error("The AI's response was cut off, resulting in incomplete data. This can happen with very large documents or complex requests. Please try again, perhaps with a smaller document.");
            }
            throw new Error("AI returned a malformed JSON response. No valid JSON found.");
        }
    }
};

const performSearch = async (query: string, lang: Language): Promise<string> => {
  try {
    const model = 'gemini-flash-latest';
    
    const prompt = `You are a search assistant. Your task is to perform a web search to find the most relevant information for a given query.
      ${getLanguageInstruction(lang)}
      Query: "${query}"
      
      Based on your search, provide a concise summary of the key information.
      Your output should only be the summary text. Do not attempt to answer a question directly, just provide the factual information you found.
    `;
    
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 2048 }
      },
    });

    const searchResultText = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    let sourcesText = "";
    if (groundingChunks) {
      const uris = new Set<string>();
      groundingChunks.forEach((chunk: any) => {
          if (chunk?.web?.uri) {
              uris.add(chunk.web.uri);
          }
      });
        
      if (uris.size > 0) {
        sourcesText = (lang === 'vi' ? '\n\nNguồn:\n' : '\n\nSources:\n') + Array.from(uris).map((url: string) => `- ${url}`).join('\n');
      }
    }
    
    if (!searchResultText && sourcesText) {
      return lang === 'vi' 
        ? `Không tìm thấy tóm tắt. Các nguồn sau đây có thể liên quan:\n${sourcesText}` 
        : `No summary found. The following sources may be relevant:\n${sourcesText}`;
    }

    return searchResultText + sourcesText;

  } catch (error) {
    console.error("Error performing search:", error);
    const errorMessage = lang === 'vi' ? 'Tìm kiếm thất bại: ' : 'Search failed: ';
    return errorMessage + (error as Error).message;
  }
};

const generateSearchQueryForDocument = async (documentText: string, lang: Language): Promise<string> => {
    const model = 'gemini-flash-latest';
    const prompt = `
        You are a search query expert. Your task is to analyze the provided text and generate a single, concise Google search query that best represents the main topic. The query will be used to find supplementary information. 
        ${getLanguageInstruction(lang)}
        Output only the raw search query string and nothing else.

        --- DOCUMENT TEXT (first 4000 chars) ---
        ${documentText.substring(0, 4000)}
        --- END DOCUMENT TEXT ---
    `;

    const response = await ai.models.generateContent({
        model: model,
        contents: { parts: [{ text: prompt }] },
        config: {
            thinkingConfig: { thinkingBudget: 2048 }
        }
    });

    return response.text.trim();
}


/**
 * Implements an agent-like two-step search process.
 * 1. Gemini is asked to either answer directly or generate search queries.
 * 2. If queries are generated, they are executed.
 * 3. Gemini is called again with the search results to synthesize a final answer.
 */
const runAgenticSearch = async (
    initialPrompt: string,
    modelName: GeminiModel,
    lang: Language,
    config: any
): Promise<string> => {
    const webSearchTool: FunctionDeclaration = {
        name: 'web_search',
        description: 'Performs web searches to find up-to-date information on given topics. Can be called with multiple queries at once to answer complex questions.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                queries: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'A list of distinct search queries to execute in parallel.'
                }
            },
            required: ['queries']
        }
    };

    // --- 1. First Call: Planning Step ---
    const planningResponse = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: initialPrompt }] },
        config: {
            ...config,
            tools: [{ functionDeclarations: [webSearchTool] }]
        }
    });

    const functionCalls = planningResponse.functionCalls;

    // If the model answers directly without calling the tool, return that answer.
    if (!functionCalls || functionCalls.length === 0) {
        return planningResponse.text;
    }

    // --- 2. Execute Tool Calls ---
    const searchQueries = functionCalls
        .filter(fc => fc.name === 'web_search' && fc.args.queries)
        .flatMap(fc => fc.args.queries);

    if (searchQueries.length === 0) {
        // The model tried to call a tool but provided no queries, return its initial text.
        return planningResponse.text;
    }

    const searchResults = await Promise.all(
        searchQueries.map((query: string) => performSearch(query, lang))
    );
    const searchContext = searchResults.join('\n\n---\n\n');

    // --- 3. Second Call: Synthesis Step ---
    const synthesisPrompt = `
        You are an expert AI assistant. Your task is to synthesize a final, accurate answer based on an original request and the results from a web search you previously requested.
        ${getLanguageInstruction(lang)}

        --- ORIGINAL REQUEST ---
        ${initialPrompt}
        --- END ORIGINAL REQUEST ---

        --- WEB SEARCH RESULTS ---
        ${searchContext}
        --- END WEB SEARCH RESULTS ---

        Now, using the provided search results as your primary source of truth, fulfill the original request.
        Ensure your final output strictly adheres to the JSON format specified in the original request.
    `;

    const synthesisResponse = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: synthesisPrompt }] },
        config: config // Pass original config (like responseMimeType) but NO tools
    });

    return synthesisResponse.text;
};


const getExtractionPrompt = (
    selectedTypes: SelectableQuestionType[],
    lang: Language,
    groundingInstruction: string,
    searchInstruction: string,
    explanationInstruction: string
): string => {
    // Instructions for each question type
    const typeInstructions = {
        'multiple-choice': `
**For 'multiple-choice' questions:**
1.  Identify any associated context passage.
2.  Identify the main question text.
3.  Identify ALL the answer options provided (e.g., A, B, C, D).
4.  Identify the single correct answer.
5.  Assemble the JSON object:
    - \`passage\`: The associated text passage, if any.
    - \`question\`: The main question text.
    - \`type\`: "multiple-choice"
    - \`options\`: An array of strings, containing ALL options.
    - \`answer\`: The string of the correct option. It MUST exactly match one of the strings in the \`options\` array.
`,
        'multi-true-false': `
**For 'multi-true-false' questions (CRITICAL):**
This is a common format where an instruction is followed by a list of statements.
1.  Identify any associated context passage.
2.  **Identify the instruction:** Find the core instruction text (e.g., "Indicate whether the following statements are true or false.", "Các nhận định sau đúng hay sai?"). This becomes the \`question\` field in the JSON.
3.  **Identify the statements:** Find EVERY statement that follows the instruction. These are the individual items to be evaluated.
4.  **DO NOT PUT STATEMENTS IN THE \`question\` FIELD.** The \`question\` field should ONLY contain the main instruction.
5.  For EACH statement, determine if it is 'True' or 'False'.
6.  Assemble the JSON object:
    - \`passage\`: The associated text passage, if any.
    - \`question\`: The main instruction text identified in step 2.
    - \`type\`: "multi-true-false"
    - \`subQuestions\`: An array of objects. Each object MUST have:
        - \`statement\`: The full text of the individual statement (from step 3).
        - \`answer\`: The string 'True' or 'False'.
`,
        'short-answer': `
**For 'short-answer' questions:**
This could be a fill-in-the-blank or a direct question expecting a brief response.
1.  Identify any associated context passage.
2.  Identify the question being asked.
3.  Identify the single, concise correct answer.
4.  Assemble the JSON object:
    - \`passage\`: The associated text passage, if any.
    - \`question\`: The question text.
    - \`type\`: "short-answer"
    - \`answer\`: A string containing the exact correct answer.
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
    - \`type\`: One of ${selectedTypes.map(t => `"${t}"`).join(', ')}.
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
    config: GenerateQuizConfig,
    groundingInstruction: string,
    searchInstruction: string,
    explanationInstruction: string
): string => {
    
    // --- Build Detailed Question & Difficulty Count Instruction ---
    let overallInstruction = 'You are tasked with generating a specific set of questions. Here is the breakdown:\n';
    let hasInstructions = false;

    for (const type of config.selectedTypes) {
        let typeInstruction = '';
        const totalMode = config.questionCountModes[type];
        const totalCount = config.customQuestionCounts[type] || 0;
        const selectedDifficulties = Array.from(config.difficultyLevels[type] || []);

        if (selectedDifficulties.length === 0) continue; // Skip if no difficulties are selected for this type

        hasInstructions = true;
        typeInstruction += `\nFor question type '${type}':\n`;

        if (totalMode === 'custom' && totalCount > 0) {
            typeInstruction += `- You MUST generate a total of EXACTLY ${totalCount} question(s) of this type.\n`;
        } else { // Auto total count
            typeInstruction += `- You must intelligently determine a reasonable total number of questions for this type based on the source material.\n`;
        }

        const difficultyDetails: string[] = [];
        for (const level of selectedDifficulties) {
            const diffMode = config.difficultyCountModes[type]?.[level];
            const diffCount = config.difficultyCounts[type]?.[level] || 0;
            if (diffMode === 'custom' && diffCount > 0) {
                difficultyDetails.push(`EXACTLY ${diffCount} at the '${level}' level`);
            } else { // Auto difficulty count
                difficultyDetails.push(`an appropriate number at the '${level}' level`);
            }
        }
        typeInstruction += `- The difficulty distribution for these questions MUST be as follows: ${difficultyDetails.join(', ')}.\n`;
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
    - \`type\`: One of ${config.selectedTypes.map(t => `"${t}"`).join(', ')}.
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


export const generateQuiz = async (config: GenerateQuizConfig): Promise<QuizQuestion[]> => {
  const { 
    fileParts, selectedTypes, modelName, lang, groundingContent, 
    integrateGeneralAI, shouldGenerateExplanations = true, useWebSearch = false,
    generationMode
  } = config;

  let searchInstruction = '';
    if (useWebSearch) {
        const documentText = fileParts.filter(p => p.text).map(p => p.text).join('\n');
        
        if (documentText.trim()) {
            try {
                const searchQuery = await generateSearchQueryForDocument(documentText, lang);
                const searchContext = await performSearch(searchQuery, lang);
                
                searchInstruction = `
--- WEB SEARCH RESULTS ---
You may use the following web search results as a supplementary source of information, especially for generating rich and accurate explanations. However, the questions and answers themselves MUST originate from the source document provided. Do not create new questions based on this search information.
--- END WEB SEARCH RESULTS ---
`;
            } catch (error) {
                console.error("Error during web search pre-processing step:", error);
                // Don't fail the whole generation, just proceed without search context
            }
        }
    }
  
  let groundingInstruction = '';
  if (shouldGenerateExplanations && groundingContent) {
    groundingInstruction = createGroundingInstruction(groundingContent, integrateGeneralAI, true);
  }

  const explanationInstruction = shouldGenerateExplanations
    ? `For EACH question, you MUST provide a clear and concise \`explanation\` for why the correct answer is correct.`
    : `You MUST set the \`explanation\` field to an empty string "" for all questions.`;

  const prompt = generationMode === 'extract'
    ? getExtractionPrompt(selectedTypes, lang, groundingInstruction, searchInstruction, explanationInstruction)
    : getTheoryGenerationPrompt(config, groundingInstruction, searchInstruction, explanationInstruction);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts: [...fileParts, { text: prompt }] },
    config: {
        thinkingConfig: { thinkingBudget: 8192 }
    }
  });
  
  return extractJson(response.text);
};


export const generateAnswerAndExplanation = async (
    question: string, 
    options: string[],
    modelName: GeminiModel,
    lang: Language,
    useWebSearch: boolean,
    groundingContent?: string,
    integrateGeneralAI?: boolean,
): Promise<{ answer: string, explanation: string }> => {
    const model = modelName;
    let groundingInstruction = '';
    if (groundingContent) {
        groundingInstruction = createGroundingInstruction(groundingContent, integrateGeneralAI);
    }
    
    const schema = {
        type: Type.OBJECT,
        properties: {
            answer: {
                type: Type.STRING,
                description: 'The single correct option from the provided list.',
                enum: options
            },
            explanation: {
                type: Type.STRING,
                description: 'A clear and concise explanation for why the answer is correct.'
            }
        },
        required: ['answer', 'explanation']
    };
    
    const prompt = `
        You are an AI quiz assistant. Your task is to analyze a multiple-choice question and determine the correct answer and provide an explanation.
        ${getLanguageInstruction(lang)}
        ${groundingInstruction}

        --- QUESTION ---
        ${question}

        --- OPTIONS ---
        ${options.map(opt => `- ${opt}`).join('\n')}

        --- INSTRUCTIONS ---
        1.  Read the question and options carefully.
        2.  Determine which option is the correct answer. The answer MUST be one of the provided options.
        3.  Provide a clear and concise explanation for why that answer is correct.

        Your response must be a single valid JSON object that adheres to the defined schema.
    `;

    const config = {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 4096 }
    };
    
    let responseText: string;
    if (useWebSearch) {
        responseText = await runAgenticSearch(prompt, model, lang, config);
    } else {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }] },
            config
        });
        responseText = response.text;
    }
    
    return extractJson(responseText);
};


export const generateShortAnswer = async (
    question: string,
    modelName: GeminiModel,
    lang: Language,
    useWebSearch: boolean,
    groundingContent?: string,
    integrateGeneralAI?: boolean,
): Promise<{ answer: string, explanation: string }> => {
    const model = modelName;
    let groundingInstruction = '';
    if (groundingContent) {
        groundingInstruction = createGroundingInstruction(groundingContent, integrateGeneralAI);
    }
    
    const schema = {
        type: Type.OBJECT,
        properties: {
            answer: {
                type: Type.STRING,
                description: 'The single, concise, and correct answer to the question.'
            },
            explanation: {
                type: Type.STRING,
                description: 'A clear and concise explanation for why the answer is correct.'
            }
        },
        required: ['answer', 'explanation']
    };
    
    const prompt = `
        You are an AI quiz assistant. Your task is to analyze a short-answer question and provide the correct answer and an explanation.
        ${getLanguageInstruction(lang)}
        ${groundingInstruction}

        --- QUESTION ---
        ${question}

        --- INSTRUCTIONS ---
        1.  Read the question carefully.
        2.  Determine the single, concise, correct answer.
        3.  Provide a clear and concise explanation for why that answer is correct.

        Your response must be a single valid JSON object that adheres to the defined schema.
    `;

     const config = {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 4096 }
    };

    let responseText: string;
    if (useWebSearch) {
        responseText = await runAgenticSearch(prompt, model, lang, config);
    } else {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }] },
            config
        });
        responseText = response.text;
    }

    return extractJson(responseText);
};


export const generateMultiTrueFalseAnswers = async (
    question: string,
    subQuestions: { statement: string }[],
    modelName: GeminiModel,
    lang: Language,
    useWebSearch: boolean,
    groundingContent?: string,
    integrateGeneralAI?: boolean,
): Promise<{ subQuestions: SubQuestion[], explanation: string }> => {
    const model = modelName;
    let groundingInstruction = '';
    if (groundingContent) {
        groundingInstruction = createGroundingInstruction(groundingContent, integrateGeneralAI);
    }

    const schema = {
        type: Type.OBJECT,
        properties: {
            result: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        answer: {
                            type: Type.STRING,
                            enum: ['True', 'False']
                        }
                    },
                    required: ['answer']
                }
            },
            explanation: {
                type: Type.STRING,
                description: 'A consolidated explanation for all statements, formatted as a numbered list.'
            }
        },
        required: ['result', 'explanation']
    };

    const prompt = `
        You are an AI quiz assistant. Your task is to determine the correct answers ('True' or 'False') for a list of statements related to a main question and provide a single, consolidated explanation.
        ${getLanguageInstruction(lang)}
        ${groundingInstruction}

        --- MAIN QUESTION ---
        ${question}

        --- STATEMENTS TO EVALUATE ---
        ${subQuestions.map((sq, i) => `${i + 1}. ${sq.statement}`).join('\n')}

        --- INSTRUCTIONS ---
        1.  Analyze each statement carefully.
        2.  For each statement, determine if it is 'True' or 'False'.
        3.  Generate a consolidated explanation for all statements.
        4.  **ABSOLUTELY CRITICAL FOR EXPLANATION:** The 'explanation' field MUST be a single string containing a numbered list. Each number MUST correspond to the statement it explains.
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

        --- OUTPUT FORMAT ---
        Your response must be a single, valid JSON object that adheres to the defined schema.
    `;
    
    const config = {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 4096 }
    };
    
    let responseText: string;
    if (useWebSearch) {
        responseText = await runAgenticSearch(prompt, model, lang, config);
    } else {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }] },
            config
        });
        responseText = response.text;
    }
    
    const result = extractJson(responseText);
    const updatedSubQuestions = subQuestions.map((sq, i) => ({
        ...sq,
        answer: result.result[i]?.answer || 'False'
    }));

    return {
        subQuestions: updatedSubQuestions,
        explanation: result.explanation
    };
};

export const validateShortAnswer = async (
    userAnswer: string,
    correctAnswer: string,
    questionContext: string,
    lang: Language
): Promise<{ isCorrect: boolean; feedback: string | null }> => {
  const model = 'gemini-flash-latest';

  const schema = {
    type: Type.OBJECT,
    properties: {
        isCorrect: {
            type: Type.BOOLEAN,
            description: `Is the user's answer semantically correct? Consider synonyms, minor typos, or different but valid ways of expressing the same answer.`
        },
        feedback: {
            type: Type.STRING,
            description: `A brief, one-sentence explanation for the user. If the user is wrong, gently guide them towards the correct answer without giving it away directly. If they are correct but used a different phrasing, acknowledge it (e.g., "Correct, that's another way to say it."). If they are correct, just say "Correct!"`
        }
    },
    required: ['isCorrect', 'feedback']
  };

  const prompt = `
    You are an intelligent quiz grading assistant. Your task is to evaluate a user's short answer for semantic correctness, not just exact string matching.
    ${getLanguageInstruction(lang)}

    --- CONTEXT ---
    Question: "${questionContext}"
    Correct Answer: "${correctAnswer}"

    --- USER'S ANSWER ---
    "${userAnswer}"

    --- INSTRUCTIONS ---
    1.  Compare the User's Answer to the Correct Answer.
    2.  Is the user's answer semantically equivalent? Consider synonyms, slightly different phrasing, and minor typos that don't change the meaning. For numerical answers, also accept answers written out as words (e.g., "five" for "5").
    3.  Determine if \`isCorrect\` should be true or false.
    4.  Provide brief, helpful feedback for the user.
    5.  Your response must be a single valid JSON object that adheres to the defined schema.
  `;
    
  const response = await ai.models.generateContent({
    model: model,
    contents: { parts: [{ text: prompt }] },
    config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 1024 }
    }
  });

  return extractJson(response.text);
};


export const fixQuizQuestion = async (
    originalQuestion: QuizQuestion,
    documentParts: Part[] | null,
    userPrompt: string,
    modelName: GeminiModel,
    lang: Language,
): Promise<QuizQuestion> => {
    const model = modelName;

    const sourceDocumentInstruction = (documentParts && documentParts.length > 0)
        ? `--- SOURCE DOCUMENT ---
        [Content of the document is provided in the multimodal input. You MUST prioritize this document as the source of truth.]`
        : `--- CONTEXT ---
        No source document was provided. You MUST rely on your general knowledge to fulfill the user's request.`;

    const prompt = `
        You are an AI assistant tasked with correcting a quiz question based on a user's instruction and, if available, a source document.
        ${getLanguageInstruction(lang)}

        ${sourceDocumentInstruction}

        --- ORIGINAL QUESTION (JSON) ---
        ${JSON.stringify(originalQuestion, null, 2)}

        --- USER'S INSTRUCTION ---
        ${userPrompt || "The user did not provide a specific instruction. Please analyze the original question against the source document (if provided) or your general knowledge, and correct any inaccuracies you find in the question text, options, answer, or explanation."}

        --- TASK ---
        1.  Analyze the user's instruction and the original question.
        2.  Carefully use the provided source document (if available) or your general knowledge to find the correct information.
        3.  Generate a corrected version of the question.
        4.  Your output MUST be a single, valid JSON object representing the corrected question.
        5.  The JSON structure must exactly match the structure of the original question object provided above (including fields like 'type', 'question', 'options', 'answer', 'explanation', 'subQuestions', etc.).
        6.  Do not include any text or markdown outside of the JSON object in your response.
    `;

    const response = await ai.models.generateContent({
        model: model,
        contents: { parts: [...(documentParts || []), { text: prompt }] },
        config: {
            thinkingConfig: { thinkingBudget: 8192 }
        }
    });

    return extractJson(response.text);
};

interface GenerateAdditionalQuestionsConfig {
  userPrompt: string;
  documentParts: Part[] | null;
  existingQuestions: QuizQuestion[];
  modelName: GeminiModel;
  lang: Language;
}

export const generateAdditionalQuestions = async (config: GenerateAdditionalQuestionsConfig): Promise<QuizQuestion[]> => {
    const { userPrompt, documentParts, existingQuestions, modelName, lang } = config;

     const sourceInstruction = (documentParts && documentParts.length > 0)
    ? `--- SOURCE DOCUMENT ---
[Content is provided in the multimodal input]

--- INSTRUCTIONS ---
1.  **Analyze the User's Prompt:** Determine the NUMBER of questions to create and their specific REQUIREMENTS (topic, format, difficulty, etc.).
2.  **Determine Question Types:** Based on the prompt, decide the question types. If the user doesn't specify a type (e.g., "trắc nghiệm", "đúng/sai"), you MUST default to 'multiple-choice'.
3.  **Use the Source Document:** All new questions MUST be based on the provided source document.
4.  **Generate Full Questions:** For each question, you must create all necessary fields: 'question', 'type', 'explanation', and type-specific fields like 'options'/'answer' or 'subQuestions'. The explanation is mandatory.
5.  **Output Format:** Your response MUST be a single, valid JSON array of question objects. Do not include any text or markdown outside of the JSON array.`
    : `--- INSTRUCTIONS ---
1.  **Analyze the User's Prompt:** Determine the NUMBER of questions to create and their specific REQUIREMENTS (topic, format, difficulty, etc.).
2.  **Determine Question Types:** Based on the prompt, decide the question types. If the user doesn't specify a type (e.g., "trắc nghiệm", "đúng/sai"), you MUST default to 'multiple-choice'.
3.  **Use General Knowledge:** No source document was provided. You must generate questions based on your general knowledge, guided by the user's prompt.
4.  **Generate Full Questions:** For each question, you must create all necessary fields: 'question', 'type', 'explanation', and type-specific fields like 'options'/'answer' or 'subQuestions'. The explanation is mandatory.
5.  **Output Format:** Your response MUST be a single, valid JSON array of question objects. Do not include any text or markdown outside of the JSON array.`;


    const prompt = `
        You are an expert educator and AI assistant creating quiz questions.
        Your task is to generate new questions based on a user's prompt, using a source document if available, or your general knowledge if not.

        ${getLanguageInstruction(lang)}

        --- EXISTING QUIZ QUESTIONS (for context, do not repeat) ---
        ${JSON.stringify(existingQuestions.map(q => q.question), null, 2)}

        --- USER'S PROMPT ---
        "${userPrompt}"

        ${sourceInstruction}
    `;
    
    const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [...(documentParts || []), { text: prompt }] },
        config: {
            thinkingConfig: { thinkingBudget: 8192 }
        }
    });

    return extractJson(response.text);
};