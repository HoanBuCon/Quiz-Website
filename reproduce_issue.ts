
import { parseDocsContent } from './src/utils/docsParser';

const input = `ID: q-new-test
Câu 16: Đọc và trả lời các câu hỏi sau
{
Câu 1: What is the main topic?
*A. Science
B. Art

Câu 2: Who is HoanBuCon?
*A. HoanBuLiem
*B. HoanLigma
	Giải thích: MMB

Câu 3: HoanBuCon deepstrike?
*A. Sure
B. No
*C. Factos
D. WTF BRO

Câu 4: Who is the author?
result: "HoanBuCon", "HoanBuLiem", "HoanSigma"
	Giải thích: Do MMB
}
Giải thích: Hỗ trợ nhận diện giải thích nếu giải thích viết cuối block câu hỏi mẹ, sau dấu đóng ngoặc nhọn`;

console.log("Parsing content...");
console.log("Input preview: " + input.substring(0, 100) + "...");
const result = parseDocsContent(input);

console.log("Parsed Questions Count: " + result.length);
if (result.length > 0) {
    console.log("Question 1 Type: " + result[0].type);
    console.log("Question 1 Explanation: " + JSON.stringify(result[0].explanation));
    console.log("Question 1 SubQuestions: " + (result[0].subQuestions ? result[0].subQuestions.length : 0));
    
    if (result.length > 1) {
        console.log("Question 2 ID: " + result[1].id);
        console.log("Question 2 Text: " + result[1].question);
    }
}
