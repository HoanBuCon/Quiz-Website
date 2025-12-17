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
    
    // Detect question start: "Câu 1:", "Câu 2:", etc.
    const questionMatch = line.match(/^Câu\s+(\d+)\s*:/i);
    if (questionMatch) {
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
    ) || null;  // Fix: explicitly convert undefined to null
    
    imageMappings.push({ image, boundary, lineNumber });
  });
  
  // Assign images to questions
  const result: ParsedQuestion[] = questions.map((q, qIndex) => {
    const boundary = boundaries[qIndex];
    if (!boundary) return q;
    
    // Find images in this boundary
    const boundaryImages = imageMappings.filter(m => 
      m.boundary?.questionIndex === qIndex
    );
    
    if (boundaryImages.length === 0) return q;
    
    // First image → question image
    const questionImage = boundaryImages[0];
    
    // Determine if image is before first option or after
    const firstOptionLine = boundary.optionLines[0]?.line ?? boundary.endLine;
    
    let assignedQuestionImage: string | undefined;
    const assignedOptionImages: { [key: string]: string } = {};
    
    boundaryImages.forEach(({ image, lineNumber }) => {
      if (lineNumber < firstOptionLine) {
        // Image is in question area
        if (!assignedQuestionImage) {
          assignedQuestionImage = image.data;
          image.questionIndex = qIndex;
          image.location = 'question';
        }
      } else {
        // Image is in options area - find which option
        for (let i = 0; i < boundary.optionLines.length; i++) {
          const optionLine = boundary.optionLines[i];
          const nextOptionLine = boundary.optionLines[i + 1]?.line ?? boundary.endLine;
          
          if (lineNumber >= optionLine.line && lineNumber < nextOptionLine) {
            // Assign to this option
            const options = q.options;
            if (Array.isArray(options) && typeof options[optionLine.index] === 'string') {
              const optionText = options[optionLine.index];
              assignedOptionImages[optionText] = image.data;
              image.questionIndex = qIndex;
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
      questionImage: assignedQuestionImage,
      optionImages: Object.keys(assignedOptionImages).length > 0 
        ? assignedOptionImages 
        : undefined
    };
  });
  
  return result;
}

/**
 * Get unassigned images (those not mapped to any question)
 */
export function getUnassignedImages(images: ExtractedImage[]): ExtractedImage[] {
  return images.filter(img => img.location === 'unassigned' || img.questionIndex === null);
}
