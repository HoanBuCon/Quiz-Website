import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
    text: string;
    className?: string;
    block?: boolean;
}

/**
 * Component to render text with mixed LaTeX math.
 * Supports:
 * - Block math: $$...$$
 * - Inline math: $...$ or \\(...\\) (optional support)
 */
/**
 * Normalizes linear math syntax to Display LaTeX.
 * - Converts \sqrt ((...)) to \sqrt{...}
 * - Converts (numerator)/denominator to \frac{numerator}{denominator}
 */
const normalizeMath = (latex: string): string => {
    // 0. Pre-process: Clean special characters from copy-paste (Word/Equation Editor artifacts)
    // ▒ -> remove
    // 〖 〗 -> convert to parens matches user intent for grouping
    // x ̅ -> \overline{x\vphantom{b}}
    // ∙ -> \cdot
    let normalized = latex
        .replace(/[▒]/g, '')
        .replace(/[〖〗]/g, '') // Remove these brackets entirely (Revert: User prefers no extra parens)
        .replace(/x\s*̅/g, '\\overline{x\\vphantom{b}}') // Fix Unicode bar spacing
        .replace(/∙/g, '\\cdot') // Fix bullet operator
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // Remove invisible formatting chars
        .replace(/[＾ˆ]/g, '^') // Normalize carets
        .replace(/∕/g, '/') // Normalize division slash
        .replace(/–/g, '-');


    // 1. Normalize Fractions (Run FIRST to handle "Sqrt / n" or "Sum / n" structures)
    // We scan for "/" and try to identify Numerator (Left) and Denominator (Right).
    // The "Numerator" is the logical unit immediately preceding the slash.
    let maxIterations = 100;
    let hasFraction = true;

    while (hasFraction && maxIterations > 0) {
        maxIterations--;

        const slashIdx = normalized.indexOf('/');
        if (slashIdx === -1) {
            hasFraction = false;
            break;
        }

        // --- EXTRACT NUMERATOR (Left of slash) ---
        // Scan backwards. We might encounter exponents (^2), scripts (_i), or groups.
        let leftEnd = slashIdx - 1;
        while (leftEnd >= 0 && /\s/.test(normalized[leftEnd])) leftEnd--; // Skip whitespace

        if (leftEnd < 0) break; // Invalid format

        let cursor = leftEnd;
        let numStart = -1;

        // Loop to consume "Suffixes" (powers, indices) then find the "Base".
        // Base can be a Group (paren/brace) or a Term (alphanumeric/command).
        while (cursor >= 0) {
            const char = normalized[cursor];
            if (/\s/.test(char)) { cursor--; continue; }

            if (char === ')') {
                // Scan balanced parens
                let balance = 1;
                let i = cursor - 1;
                while (i >= 0) {
                    if (normalized[i] === ')') balance++;
                    else if (normalized[i] === '(') balance--;

                    if (balance === 0) {
                        // Found matching start of group
                        // Check if this group was a BASE for a previously consumed suffix?
                        // If we are "consuming suffixes", we check PREVIOUS char. 
                        // If this group is the BASE, we are done... UNLESS this group is ITSELF a suffix? (unlikely for parens).
                        // Check if PREVIOUS char implies this is a suffix? (e.g. ^(...))

                        // We need to know if we are at the END of a suffix chain or finding the Base.
                        // Simplify: A unit is [Base] [Suffixes]*
                        // We are scanning backwards: [Suffixes]* [Base]

                        // Check char BEFORE this group.
                        let prevCharIdx = i - 1;
                        while (prevCharIdx >= 0 && /\s/.test(normalized[prevCharIdx])) prevCharIdx--;

                        if (prevCharIdx >= 0 && (normalized[prevCharIdx] === '^' || normalized[prevCharIdx] === '_')) {
                            // This group was a value for a suffix (e.g. ^{...} or ^(...)).
                            // Consume the operator.
                            cursor = prevCharIdx - 1;
                            continue;
                        } else {
                            // This group IS the Base.
                            numStart = i;
                            cursor = -1; // Done
                        }
                        break;
                    }
                    i--;
                }
                if (balance !== 0) { numStart = -1; break; } // Unbalanced
            } else if (char === '}') {
                // Same as above for braces
                let balance = 1;
                let i = cursor - 1;
                while (i >= 0) {
                    if (normalized[i] === '}') balance++;
                    else if (normalized[i] === '{') balance--;

                    if (balance === 0) {
                        let prevCharIdx = i - 1;
                        while (prevCharIdx >= 0 && /\s/.test(normalized[prevCharIdx])) prevCharIdx--;

                        if (prevCharIdx >= 0 && (normalized[prevCharIdx] === '^' || normalized[prevCharIdx] === '_')) {
                            cursor = prevCharIdx - 1;
                            continue;
                        } else {
                            numStart = i;
                            cursor = -1;
                        }
                        break;
                    }
                    i--;
                }
                if (balance !== 0) { numStart = -1; break; }
            } else if (/[a-zA-Z0-9\\]/.test(char)) {
                // Alphanumeric or Backslash (command like \sqrt, \sum, \alpha)
                let prevCharIdx = cursor - 1;
                while (prevCharIdx >= 0 && /\s/.test(normalized[prevCharIdx])) prevCharIdx--;

                // Check if it is a suffix value? (e.g. ^2, _i)
                if (prevCharIdx >= 0 && (normalized[prevCharIdx] === '^' || normalized[prevCharIdx] === '_')) {
                    cursor = prevCharIdx - 1;
                    continue;
                } else {
                    // It is the Base (or end of Base).
                    // Scan left to capture full command or word.
                    let i = cursor;
                    while (i >= 0 && /[a-zA-Z0-9\\]/.test(normalized[i])) i--;
                    numStart = i + 1;
                    cursor = -1; // Done
                    break;
                }
            } else {
                // Unknown char => likely Operator bound (e.g. + - =)
                break;
            }
        }

        if (numStart === -1) {
            // Temporarily hide this slash to continue search
            normalized = normalized.substring(0, slashIdx) + "__SLASH__" + normalized.substring(slashIdx + 1);
            continue;
        }


        // --- EXTRACT DENOMINATOR (Right of slash) ---
        let rightStart = slashIdx + 1;
        while (rightStart < normalized.length && /\s/.test(normalized[rightStart])) rightStart++; // Skip whitespace

        if (rightStart >= normalized.length) break;

        let denEnd = -1;
        let denContent = "";
        let dCursor = rightStart;

        // Find Base
        if (normalized[dCursor] === '(') {
            let balance = 1;
            let i = dCursor + 1;
            while (i < normalized.length) {
                if (normalized[i] === '(') balance++;
                else if (normalized[i] === ')') balance--;
                if (balance === 0) { dCursor = i + 1; break; }
                i++;
            }
        } else if (normalized[dCursor] === '{') {
            let balance = 1;
            let i = dCursor + 1;
            while (i < normalized.length) {
                if (normalized[i] === '{') balance++;
                else if (normalized[i] === '}') balance--;
                if (balance === 0) { dCursor = i + 1; break; }
                i++;
            }
        } else {
            let i = dCursor;
            while (i < normalized.length && /[a-zA-Z0-9\\]/.test(normalized[i])) i++;
            dCursor = i;
        }

        // Suffixes (can be chained e.g. x_i^2)
        while (true) {
            let next = dCursor;
            while (next < normalized.length && /\s/.test(normalized[next])) next++;

            if (next < normalized.length && (normalized[next] === '^' || normalized[next] === '_')) {
                dCursor = next + 1;
                while (dCursor < normalized.length && /\s/.test(normalized[dCursor])) dCursor++;
                // Value
                if (dCursor >= normalized.length) break;
                if (normalized[dCursor] === '(' || normalized[dCursor] === '{') {
                    const opener = normalized[dCursor];
                    const closer = opener === '(' ? ')' : '}';
                    let balance = 1;
                    let i = dCursor + 1;
                    while (i < normalized.length) {
                        if (normalized[i] === opener) balance++;
                        else if (normalized[i] === closer) balance--;
                        if (balance === 0) { dCursor = i + 1; break; }
                        i++;
                    }
                } else {
                    if (/[a-zA-Z0-9]/.test(normalized[dCursor])) dCursor++;
                }
            } else {
                break;
            }
        }

        denEnd = dCursor - 1;

        if (denEnd < rightStart) {
            normalized = normalized.substring(0, slashIdx) + "__SLASH__" + normalized.substring(slashIdx + 1);
            continue;
        }

        let nContent = normalized.substring(numStart, slashIdx).trim();
        let dContent = normalized.substring(rightStart, denEnd + 1).trim();

        // Unwrap parens IF they wrap the logical whole
        if (nContent.startsWith('(') && nContent.endsWith(')')) {
            let balance = 0, wrapped = true;
            for (let k = 0; k < nContent.length - 1; k++) {
                if (nContent[k] === '(') balance++; else if (nContent[k] === ')') balance--;
                if (balance === 0) { wrapped = false; break; }
            }
            if (wrapped) nContent = nContent.slice(1, -1);
        }
        if (dContent.startsWith('(') && dContent.endsWith(')')) {
            let balance = 0, wrapped = true;
            for (let k = 0; k < dContent.length - 1; k++) {
                if (dContent[k] === '(') balance++; else if (dContent[k] === ')') balance--;
                if (balance === 0) { wrapped = false; break; }
            }
            if (wrapped) dContent = dContent.slice(1, -1);
        }

        const before = normalized.substring(0, numStart);
        const after = normalized.substring(denEnd + 1);

        normalized = `${before}\\frac{${nContent}}{${dContent}}${after}`;
    }

    // Restore hidden slashes
    normalized = normalized.replace(/__SLASH__/g, '/');


    // 2. Normalize Square Roots (Run SECOND)
    let sqMax = 100;
    let hasSqrt = true;
    while (hasSqrt && sqMax > 0) {
        sqMax--;
        const match = /\\sqrt\s*\(/.exec(normalized);
        if (!match) { hasSqrt = false; break; }

        const startIdx = match.index;
        const openParenIdx = startIdx + match[0].length - 1; // Index of '('

        let balance = 1;
        let closeIdx = -1;
        for (let i = openParenIdx + 1; i < normalized.length; i++) {
            if (normalized[i] === '(') balance++;
            else if (normalized[i] === ')') balance--;

            if (balance === 0) {
                closeIdx = i;
                break;
            }
        }

        if (closeIdx !== -1) {
            let content = normalized.substring(openParenIdx + 1, closeIdx);
            // Unwrap double parens
            if (content.trim().startsWith('(') && content.trim().endsWith(')')) {
                const trimmed = content.trim();
                let bal = 0; let wrapped = true;
                for (let k = 0; k < trimmed.length - 1; k++) {
                    if (trimmed[k] === '(') bal++; else if (trimmed[k] === ')') bal--;
                    if (balance === 0) { wrapped = false; break; }
                }
                if (wrapped) content = trimmed.slice(1, -1);
            }
            const before = normalized.substring(0, startIdx);
            const after = normalized.substring(closeIdx + 1);
            normalized = `${before}\\sqrt{${content}}${after}`;
        } else {
            normalized = normalized.substring(0, startIdx) + "__SQRT__" + normalized.substring(startIdx + 5);
        }
    }
    normalized = normalized.replace(/__SQRT__/g, '\\sqrt');


    // 3. Visual Tweaks
    normalized = normalized.replace(/\\bar\s*\{(.*?)\}/g, '\\overline{$1\\vphantom{b}}');
    normalized = normalized.replace(/\\bar\s+([a-zA-Z0-9])/g, '\\overline{$1\\vphantom{b}}');
    normalized = normalized.replace(/\\overline\s*\{(.*?)\}/g, (match, content) => {
        if (content.includes('vphantom')) return match;
        return `\\overline{${content}\\vphantom{b}}`;
    });

    return normalized;
};

const MathText: React.FC<MathTextProps> = ({ text, className = '', block = false }) => {
    if (!text) return null;

    // Split by math delimiters and markdown code blocks
    // Added: ```[\s\S]*?``` for code blocks
    const regex = /(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\sqrt\s*\(\(.*?\)\)|(?:\\[a-zA-Z]+(?:\{[^}]*\})*))/g;

    const parts = text.split(regex);

    return (
        <span className={`math-text-container whitespace-pre-wrap ${className} ${block ? 'block' : ''}`}>
            {parts.map((part, index) => {
                if (part.startsWith('```') && part.endsWith('```')) {
                    // Markdown Code Block
                    // Extract content between ``` and ```
                    let code = part.slice(3, -3);
                    // Remove the first newline if it exists (common pattern ```\nCode)
                    if (code.startsWith('\n')) code = code.slice(1);

                    return (
                        <div key={index} className="bg-[#2b2d31] text-gray-100 p-3 rounded-md font-mono text-sm overflow-x-auto my-2 whitespace-pre shadow-inner">
                            {code}
                        </div>
                    );
                } else if (part.startsWith('$$') && part.endsWith('$$')) {
                    // Block Math
                    let math = part.slice(2, -2);
                    math = normalizeMath(math); // Normalize
                    try {
                        const html = katex.renderToString(math, {
                            displayMode: true,
                            throwOnError: false,
                            output: 'mathml'
                        });
                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                    } catch (e) {
                        return <span key={index} className="text-red-500">{part}</span>;
                    }
                } else if (part.startsWith('$') && part.endsWith('$')) {
                    // Inline Math
                    let math = part.slice(1, -1);
                    math = normalizeMath(math); // Normalize
                    try {
                        const html = katex.renderToString(math, {
                            displayMode: false,
                            throwOnError: false,
                            output: 'mathml'
                        });
                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                    } catch (e) {
                        return <span key={index} className="text-red-500">{part}</span>;
                    }
                } else if (part.startsWith('\\')) {
                    // Implicit Inline Math (Command)
                    let math = part;
                    math = normalizeMath(math);
                    try {
                        const html = katex.renderToString(math, {
                            displayMode: false,
                            throwOnError: false,
                            output: 'mathml'
                        });
                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                    } catch (e) {
                        // console.error(e);
                        return <span key={index}>{part}</span>;
                    }
                } else {
                    // Plain text
                    // Check for implicit fractions in plain text (e.g. 1/2) that weren't caught as commands?
                    // normalizeMath is only called on Matches.
                    // If the user inputs "1/2" without $, it goes here.
                    // If we want "handwritten" style everywhere, we might want to normalize this too?
                    // But that risks upgrading date strings "1/1/2023" to math.
                    // Strict: Only normalize explicit math blocks or valid implicit commands.
                    // IMPORTANT: Add whitespace-pre-wrap to preserve newlines and indentation in multiline text (e.g., code snippets)
                    return <span key={index} className="whitespace-pre-wrap">{part}</span>;
                }
            })}
        </span>
    );
};

export default MathText;
