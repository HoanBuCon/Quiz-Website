import React from 'react';

interface LatexRendererProps {
  text: string | null | undefined;
}

const LatexRenderer: React.FC<LatexRendererProps> = ({ text }) => {
  if (!text) {
    return null;
  }
  
  // FIX: Use React.ReactElement instead of JSX.Element to fix "Cannot find namespace 'JSX'" error.
  const highlightKeywords = (textSegment: string, keyPrefix: string): string => {
    // Disabled keyword highlighting by returning the original text.
    return textSegment;
  };

  const regex = /(```[\s\S]*?```|`[^`]*?`|\*\*.*?\*\*|\*.*?\*)/g;
  const parts = text.split(regex).filter(Boolean);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        // Code block (triple backticks) or inline code (single backticks)
        if ((part.startsWith('```') && part.endsWith('```')) || (part.startsWith('`') && part.endsWith('`'))) {
          const isBlock = part.startsWith('```');
          const code = isBlock ? part.slice(3, -3).trim() : part.slice(1, -1).trim();
          return (
            <code
              key={index}
              className="bg-base-100 text-text-main font-mono text-sm px-1.5 py-1 rounded-md mx-1 align-baseline"
            >
              {code}
            </code>
          );
        }
        // Bold text
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index}>{highlightKeywords(boldText, `bold-${index}`)}</strong>;
        }
        // Italic text
        if (part.startsWith('*') && part.endsWith('*')) {
          const italicText = part.slice(1, -1);
          return <em key={index}>{highlightKeywords(italicText, `italic-${index}`)}</em>;
        }
        // Plain text parts
        return <span key={index}>{highlightKeywords(part, `plain-${index}`)}</span>;
      })}
    </span>
  );
};

export default LatexRenderer;