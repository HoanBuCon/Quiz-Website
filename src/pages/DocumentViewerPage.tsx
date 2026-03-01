import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UploadedFile } from "../types";
import { DocumentsAPI } from "../utils/api";
import { getToken } from "../utils/auth";
import { useTheme } from "../context/ThemeContext";
import { renderAsync } from "docx-preview";

// ─── Shared DOM-based Search Highlight Logic ──────────────────────────────────
// Works identically for both DOCX (div container) and plain-text (<pre>).
// No React re-rendering — we walk text nodes and inject <mark> elements directly.

function clearHighlights(root: HTMLElement) {
    root.querySelectorAll("mark[data-search]").forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
        parent.normalize();
    });
}

function injectHighlights(root: HTMLElement, query: string): HTMLElement[] {
    clearHighlights(root);
    if (!query.trim()) return [];

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    const marks: HTMLElement[] = [];

    for (const textNode of textNodes) {
        const value = textNode.nodeValue ?? "";
        regex.lastIndex = 0;
        if (!regex.test(value)) continue;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let last = 0;
        let m: RegExpExecArray | null;

        while ((m = regex.exec(value)) !== null) {
            if (m.index > last)
                fragment.appendChild(document.createTextNode(value.slice(last, m.index)));

            const mark = document.createElement("mark");
            mark.setAttribute("data-search", "true");
            mark.style.cssText =
                "background:#fbbf24;color:#1f2937;border-radius:2px;padding:0 1px;transition:background 0.15s;";
            mark.textContent = m[0];
            fragment.appendChild(mark);
            marks.push(mark);
            last = regex.lastIndex;
        }
        if (last < value.length)
            fragment.appendChild(document.createTextNode(value.slice(last)));

        textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return marks;
}

function scrollToMark(marks: HTMLElement[], index: number) {
    marks.forEach((m, i) => {
        m.style.background = i === index ? "#f59e0b" : "#fbbf24";
        m.style.outline = i === index ? "2px solid #d97706" : "none";
    });
    marks[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

interface SearchBarProps {
    /** DOM root to search within (either DOCX container or plain-text <pre>) */
    contentRef: React.RefObject<HTMLElement | null>;
}

const SearchBar: React.FC<SearchBarProps> = ({ contentRef }) => {
    const [query, setQuery] = useState("");
    const [matchCount, setMatchCount] = useState(0);
    const [currentMatch, setCurrentMatch] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const marksRef = useRef<HTMLElement[]>([]);

    // Re-run highlight whenever query changes
    useEffect(() => {
        if (!contentRef.current) return;
        const marks = injectHighlights(contentRef.current, query);
        marksRef.current = marks;
        setMatchCount(marks.length);
        setCurrentMatch(marks.length > 0 ? 1 : 0);
        if (marks.length > 0) scrollToMark(marks, 0);
    }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

    const goPrev = useCallback(() => {
        if (matchCount === 0) return;
        const idx = (currentMatch - 2 + matchCount) % matchCount;
        setCurrentMatch(idx + 1);
        scrollToMark(marksRef.current, idx);
    }, [currentMatch, matchCount]);

    const goNext = useCallback(() => {
        if (matchCount === 0) return;
        const idx = currentMatch % matchCount;
        setCurrentMatch(idx + 1);
        scrollToMark(marksRef.current, idx);
    }, [currentMatch, matchCount]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            e.shiftKey ? goPrev() : goNext();
        }
    };

    // Always-visible pill — same style as zoom controls
    return (
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 md:p-2 shadow-sm border border-gray-200 dark:border-gray-700 w-full md:w-auto">
            {/* Search icon — wrapped to match zoom button height */}
            <span className="p-1 md:p-1.5 flex-shrink-0 text-gray-400 dark:text-gray-500">
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
            </span>

            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tìm kiếm…"
                className="flex-1 min-w-0 h-6 md:h-8 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
            />

            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap select-none min-w-[4.5rem] text-right">
                {query.trim()
                    ? matchCount === 0
                        ? "Không thấy"
                        : `${currentMatch} / ${matchCount}`
                    : ""}
            </span>

            {/* Clear button — only visible when query is non-empty */}
            {query && (
                <button
                    onClick={() => setQuery("")}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                    title="Xóa tìm kiếm"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}

            <div className="flex items-center gap-0.5 border-l border-gray-200 dark:border-gray-600 pl-1 ml-0.5">
                <button onClick={goPrev} disabled={matchCount === 0}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-500 dark:text-gray-400"
                    title="Kết quả trước (Shift+Enter)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button onClick={goNext} disabled={matchCount === 0}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-500 dark:text-gray-400"
                    title="Kết quả tiếp theo (Enter)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const DocumentViewerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();

    const [document, setDocument] = useState<UploadedFile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // containerRef  → DOCX rendered output
    // textRef       → plain-text <pre>
    // searchRef     → whichever is active (passed to SearchBar)
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLPreElement>(null);

    const [zoomLevel, setZoomLevel] = useState(1);
    const [fileBlob, setFileBlob] = useState<Blob | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const isDocx = document?.type === "docs";
    const isPdf = document?.type === "pdf";

    // The ref we hand to SearchBar depends on document type (null for PDF — iframe handles its own search)
    const searchContentRef = (isDocx ? containerRef : textRef) as React.RefObject<HTMLElement | null>;

    // ── Fetch ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        const fetchDocument = async () => {
            if (!id) return;
            try {
                setLoading(true);
                const token = getToken();
                if (!token) { navigate("/login"); return; }

                const doc = await DocumentsAPI.getById(id, token);
                setDocument(doc);

                if (!doc.content && (doc as any).filePath) {
                    try {
                        const { getApiBaseUrl } = await import("../utils/api");
                        const fileUrl = `${getApiBaseUrl()}/${(doc as any).filePath}`;

                        if (doc.type === "pdf") {
                            // Fetch PDF as blob → create object URL (avoids cross-origin iframe block)
                            const res = await fetch(fileUrl);
                            if (res.ok) {
                                const blob = await res.blob();
                                const objectUrl = URL.createObjectURL(blob);
                                setPdfUrl(objectUrl);
                            }
                        } else {
                            const res = await fetch(fileUrl);
                            if (res.ok) {
                                if (doc.type === "docs") {
                                    setFileBlob(await res.blob());
                                } else {
                                    const text = await res.text();
                                    setDocument({ ...doc, content: text });
                                }
                            }
                        }
                    } catch { /* silent */ }
                }
            } catch {
                setError("Không thể tải tài liệu. Vui lòng thử lại sau.");
            } finally {
                setLoading(false);
            }
        };
        fetchDocument();
    }, [id, navigate]);

    // ── DOCX render ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (fileBlob && containerRef.current) {
            containerRef.current.innerHTML = "";
            renderAsync(fileBlob, containerRef.current, containerRef.current, {
                className: "docx-viewer",
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
            }).catch((err) => console.error("Failed to render DOCX:", err));
        }
    }, [fileBlob]);

    // Cleanup blob URL when unmounting to avoid memory leak
    useEffect(() => {
        return () => {
            if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    // ── Ctrl+Scroll Zoom ──────────────────────────────────────────────────────

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setZoomLevel((prev) =>
                    e.deltaY < 0
                        ? Math.min(prev + 0.1, 3.0)
                        : Math.max(prev - 0.1, 0.1)
                );
            }
        };
        window.addEventListener("wheel", handleWheel, { passive: false });
        return () => window.removeEventListener("wheel", handleWheel);
    }, []);

    const handleZoomIn = () => setZoomLevel((p) => Math.min(p + 0.1, 3.0));
    const handleZoomOut = () => setZoomLevel((p) => Math.max(p - 0.1, 0.1));
    const handleResetZoom = () => setZoomLevel(1);
    const handleBack = () => navigate("/documents");

    // ── Content ───────────────────────────────────────────────────────────────

    const renderContent = () => {
        if (!document) return null;

        // ── PDF via iframe ─────────────────────────────────────────────────────
        if (isPdf && pdfUrl) {
            return (
                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm h-full">
                    <iframe
                        src={pdfUrl}
                        title={document.name}
                        className="w-full h-full"
                        style={{ minHeight: "70vh" }}
                    />
                </div>
            );
        }

        if (isPdf && !pdfUrl) {
            return (
                <div className="text-center py-20 text-gray-500">
                    <p>Không thể tải file PDF. Vui lòng thử lại sau.</p>
                </div>
            );
        }

        // ── DOCX ───────────────────────────────────────────────────────────────
        if (isDocx) {
            return (
                <div className="bg-gray-100 dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 overflow-auto h-full flex">
                    <div style={{ zoom: zoomLevel } as any} className="m-auto">
                        {/* containerRef is the DOCX DOM root — SearchBar will walk its text nodes */}
                        <div ref={containerRef} className="bg-white shadow-lg min-h-[500px]" />
                    </div>
                </div>
            );
        }

        if (!document.content) {
            return (
                <div className="text-center py-20">
                    <div className="mb-4 text-gray-400">
                        <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 0 01.707.293l5.414 5.414a1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <p className="text-lg text-gray-500 mb-4">Không thể hiển thị nội dung file này trực tiếp.</p>
                    <div className="flex justify-center">
                        <button className="btn-primary" onClick={() => navigate("/documents")}>Quay lại danh sách</button>
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-auto h-full">
                {/*
                    Plain <pre> — SearchBar injects <mark> into its text nodes directly.
                    No React re-render, no splitting, original whitespace preserved.
                */}
                <pre
                    ref={textRef}
                    className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-300 transition-all duration-200"
                    style={{ fontSize: `${0.875 * zoomLevel}rem` }}
                >
                    {document.content}
                </pre>
            </div>
        );
    };

    // ── Loading / Error ───────────────────────────────────────────────────────

    if (loading) {
        const SpinnerLoading = require("../components/SpinnerLoading").default;
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div style={{ transform: "scale(0.435)" }}><SpinnerLoading /></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                    <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-2">Đã xảy ra lỗi</h3>
                    <p className="text-red-600 dark:text-red-300 mb-4">{error}</p>
                    <button onClick={handleBack} className="btn-secondary">Quay lại</button>
                </div>
            </div>
        );
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    return (
        <div className="container-fluid px-4 py-6 h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-4 flex-shrink-0 gap-3">
                {/* Left */}
                <div className="flex items-center gap-4 w-full xl:flex-1 min-w-0">
                    <button
                        onClick={handleBack}
                        className="flex items-center text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex-shrink-0"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Quay lại
                    </button>
                    {document && (
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate flex-1 min-w-0">
                            {document.name}
                        </h1>
                    )}
                </div>

                {/* Right: Search + Zoom — hidden for PDF (iframe has native toolbar) */}
                {!isPdf && (
                    <div className="flex items-center justify-start md:justify-between xl:justify-end gap-2 w-full xl:w-auto flex-wrap">

                        {/* Search Bar — unified DOM approach */}
                        <SearchBar contentRef={searchContentRef} />

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 md:p-2 shadow-sm border border-gray-200 dark:border-gray-700 w-full md:w-auto">
                            <button onClick={handleZoomOut}
                                className="p-1 md:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-400"
                                title="Thu nhỏ">
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                            </button>

                            <div className="flex items-center gap-2">
                                <input type="range" min="0.1" max="3.0" step="0.1" value={zoomLevel}
                                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                                    className="w-16 sm:w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                />
                                <span className="w-10 sm:w-12 text-center text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                    {Math.round(zoomLevel * 100)}%
                                </span>
                            </div>

                            <button onClick={handleZoomIn}
                                className="p-1 md:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-400"
                                title="Phóng to">
                                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>

                            <button onClick={handleResetZoom}
                                className="px-2 py-1 ml-auto text-xs font-medium text-gray-500 hover:text-primary-600 border-l border-gray-200 dark:border-gray-600 whitespace-nowrap">
                                Reset
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};

export default DocumentViewerPage;
