import { ParsedQuestion } from './docsParser';
import { ExtractedImage } from '../types';

/**
 * Smart mapping: Assign extracted images to questions and options
 * based on their position in the Word document
 */

interface QuestionBoundary {
  questionIndex: number;
  startLine: number;
  endLine: number;
  questionTextLine: number;
  optionLines: { index: number; line: number; text: string }[];  // A, B, C, D...
}

/**
 * Find question boundaries in text content
 * Returns array of boundaries with line numbers
 */
function findQuestionBoundaries(content: string): QuestionBoundary[] {
  const lines = content.split('\n').map(line => line.trim());
  const boundaries: QuestionBoundary[] = [];
  
  let currentQuestionIndex = -1;
  let currentBoundary: QuestionBoundary | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect question start: "Câu 1:", "Câu 1.1:", "Câu :", etc.
    const isQuestionLine = line.match(/^Câu\s+[\d\.]+|Câu\s*:/i) || (line.startsWith("Câu") && line.includes(":"));
    if (isQuestionLine) {
      // Save previous boundary
      if (currentBoundary) {
        currentBoundary.endLine = i - 1;
        boundaries.push(currentBoundary);
      }
      
      // Start new boundary
      currentQuestionIndex++;
      currentBoundary = {
        questionIndex: currentQuestionIndex,
        startLine: i,
        endLine: lines.length - 1,  // Will be updated
        questionTextLine: i,
        optionLines: []
      };
      continue;
    }
    
    // Detect options: *A., A., B., C., etc.
    if (currentBoundary) {
      const optionMatch = line.match(/^\*?([A-Z])\./);
      if (optionMatch) {
        const optionLetter = optionMatch[1];
        const optionIndex = optionLetter.charCodeAt(0) - 'A'.charCodeAt(0);
        currentBoundary.optionLines.push({
          index: optionIndex,
          line: i,
          text: line
        });
      }
    }
    
    // Detect composite question start: {
    if (line === '{' && currentBoundary) {
      // Mark end of current question before composite block
      currentBoundary.endLine = i - 1;
      boundaries.push(currentBoundary);
      currentBoundary = null;
    }
  }
  
  // Save last boundary
  if (currentBoundary) {
    boundaries.push(currentBoundary);
  }
  
  return boundaries;
}

/**
 * Map images to questions based on line position
 * 
 * Logic:
 * - Extract [IMAGE] markers from text (added by wordParser)  
 * - Count line numbers where [IMAGE] appears
 * - Match with question boundaries
 */
export function assignImagesToQuestions(
  questions: ParsedQuestion[],
  images: ExtractedImage[],
  textContent: string
): ParsedQuestion[] {
  if (!images || images.length === 0) {
    return questions;  // No images to assign
  }
  
  // Find [IMAGE] markers in text
  const lines = textContent.split('\n').map(line => line.trim());
  const imageLines: number[] = [];
  
  lines.forEach((line, index) => {
    if (line === '[IMAGE]') {
      imageLines.push(index);
    }
  });
  
  // Find question boundaries
  const boundaries = findQuestionBoundaries(textContent);
  
  // Map each image to a boundary
  const imageMappings: Array<{
    image: ExtractedImage;
    boundary: QuestionBoundary | null;
    lineNumber: number;
  }> = [];
  
  images.forEach((image, index) => {
    const lineNumber = imageLines[index];
    if (lineNumber === undefined) {
      imageMappings.push({ image, boundary: null, lineNumber: -1 });
      return;
    }
    
    // Find which boundary this line belongs to
    const boundary = boundaries.find(b => 
      lineNumber >= b.startLine && lineNumber <= b.endLine
    ) || null;
    
    imageMappings.push({ image, boundary, lineNumber });
  });
  
  // Helper to assign images to a single question based on a specific boundary
  const updateQuestionWithImages = (q: ParsedQuestion, boundary: QuestionBoundary): ParsedQuestion => {
     // Find images in this boundary
    const boundaryImages = imageMappings.filter(m => 
      m.boundary === boundary // Strict object reference check works because boundary objects are unique
    );
    
    if (boundaryImages.length === 0) return q;
    
    // First image → question image
    // Find "Header" images (before options)
    // Fix: If no options, treat entire boundary as question area (use endLine + 1)
    const firstOptionLine = boundary.optionLines[0]?.line ?? (boundary.endLine + 1);
    
    let assignedQuestionImage: string | undefined;
    const assignedOptionImages: { [key: string]: string } = {};
    
    boundaryImages.forEach(({ image, lineNumber }) => {
      // Determine if image is in Question area or Option area
      if (lineNumber < firstOptionLine) {
        // Image is in question area
        if (!assignedQuestionImage) {
          assignedQuestionImage = image.data;
          image.questionIndex = boundary.questionIndex;
          image.location = 'question';
        }
      } else {
        // Image is in options area - find which option
        for (let i = 0; i < boundary.optionLines.length; i++) {
          const optionLine = boundary.optionLines[i];
          const nextOptionLine = boundary.optionLines[i + 1]?.line ?? (boundary.endLine + 1);
          
          if (lineNumber >= optionLine.line && lineNumber < nextOptionLine) {
            // Assign to this option
            const options = q.options;
            // Handle both Array options and DragOptions object
            if (Array.isArray(options) && typeof options[optionLine.index] === 'string') {
               const optionText = options[optionLine.index];
               assignedOptionImages[optionText] = image.data;
               image.questionIndex = boundary.questionIndex;
               image.location = 'option';
               image.optionIndex = optionLine.index;
            }
            break;
          }
        }
      }
    });

    return {
      ...q,
      questionImage: assignedQuestionImage || q.questionImage,
      optionImages: Object.keys(assignedOptionImages).length > 0 
        ? { ...q.optionImages, ...assignedOptionImages }
        : q.optionImages
    };
  };

  // State for sequential consumption of boundaries
  let boundaryCursor = 0;

  const processQuestions = (qs: ParsedQuestion[]): ParsedQuestion[] => {
    return qs.map(q => {
      // Consume boundary
      const boundary = boundaries[boundaryCursor];
      boundaryCursor++;

      let updatedQ = q;
      if (boundary) {
         updatedQ = updateQuestionWithImages(q, boundary);
      }

      // Recurse for subQuestions (which also have their own boundaries in the text)
      if (updatedQ.subQuestions && updatedQ.subQuestions.length > 0) {
        updatedQ.subQuestions = processQuestions(updatedQ.subQuestions);
      }
      
      return updatedQ;
    });
  };
  
  return processQuestions(questions);
}

/**
 * Get unassigned images (those not mapped to any question)
 */
export function getUnassignedImages(images: ExtractedImage[]): ExtractedImage[] {
  return images.filter(img => img.location === 'unassigned' || img.questionIndex === null);
}
