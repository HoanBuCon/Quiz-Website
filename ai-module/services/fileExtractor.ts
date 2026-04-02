
import { Part } from "@google/genai";

// These are global variables from the scripts in index.html
declare const mammoth: any;
declare const pdfjsLib: any;

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Extracts content from a file and prepares it as an array of Parts for the Gemini API.
 * For DOCX, it converts to HTML to preserve tables and can extract images.
 * For PDF, it can render each page as an image or extract just text.
 * For TXT, it reads the text content.
 */
export const extractFileParts = async (file: File): Promise<Part[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type;

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();

    // With visuals: extract text and images separately
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    const container = document.createElement('div');
    container.innerHTML = html;
    
    const images = Array.from(container.querySelectorAll('img'));
    const imageParts: Part[] = [];

    images.forEach((img, i) => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('data:')) {
            const [header, base64Data] = src.split(',');
            const mimeMatch = header.match(/data:(.*?);/);
            if (mimeMatch && base64Data) {
                const mimeType = mimeMatch[1];
                imageParts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data,
                    }
                });
                img.parentNode?.replaceChild(document.createTextNode(` [Image ${i + 1}] `), img);
            } else {
                 img.parentNode?.replaceChild(document.createTextNode(` [Unsupported Image] `), img);
            }
        } else {
            img.parentNode?.replaceChild(document.createTextNode(` [Image Source Not Found] `), img);
        }
    });
    
    const textContent = container.innerHTML.replace(/<p><\/p>/g, '');
    return [{ text: textContent }, ...imageParts];

  } else if (extension === 'pdf') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Process with visuals
    const parts: Part[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error("Could not create canvas context");
    }

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };
        await page.render(renderContext).promise;
        
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
        if (blob) {
            const base64 = await blobToBase64(blob);
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64,
                }
            });
        }
      } catch (e) {
        console.error(`Error processing page ${i}:`, e);
      }
    }
    // FIX: The canvas was created in memory but never added to the DOM.
    // Calling removeChild would cause an error. The canvas is temporary
    // and will be garbage collected, so no removal is needed.
    return parts;
  
  } else if (extension === 'txt') {
    const text = await file.text();
    return [{ text }];
  
  } else if (mimeType.startsWith('image/')) {
    const base64 = await blobToBase64(file);
    return [{ inlineData: { mimeType, data: base64 } }];
  } else if (mimeType.startsWith('audio/')) {
    const base64 = await blobToBase64(file);
    return [{ inlineData: { mimeType, data: base64 } }];
  }
  
  throw new Error('Unsupported file type. Please upload a .docx, .pdf, .txt, image, or audio file.');
};