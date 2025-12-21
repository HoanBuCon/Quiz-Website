import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UploadedFile } from "../types";
import { DocumentsAPI } from "../utils/api";
import { getToken } from "../utils/auth";
import { useTheme } from "../context/ThemeContext";
import { renderAsync } from "docx-preview";

const DocumentViewerPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();

    const [document, setDocument] = useState<UploadedFile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [fileBlob, setFileBlob] = useState<Blob | null>(null);

    // Fetch Document
    useEffect(() => {
        const fetchDocument = async () => {
            if (!id) return;

            try {
                setLoading(true);
                const token = getToken();
                if (!token) {
                    navigate("/login");
                    return;
                }

                const doc = await DocumentsAPI.getById(id, token);
                setDocument(doc);

                // If content is missing but filePath exists, try to fetch it
                if (!doc.content && (doc as any).filePath) {
                    try {
                        const { getApiBaseUrl } = await import("../utils/api");
                        const fileUrl = `${getApiBaseUrl()}/${(doc as any).filePath}`;

                        const res = await fetch(fileUrl);
                        if (res.ok) {
                            if (doc.type === 'docs') {
                                const blob = await res.blob();
                                setFileBlob(blob);
                            } else {
                                // Text or JSON
                                const text = await res.text();
                                doc.content = text;
                                setDocument({ ...doc, content: text });
                            }
                        }
                    } catch (fetchErr) {
                        console.error("Failed to fetch file content from path:", fetchErr);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch document:", err);
                setError("Không thể tải tài liệu. Vui lòng thử lại sau.");
            } finally {
                setLoading(false);
            }
        };

        fetchDocument();
    }, [id, navigate]);

    // Handle DOCX rendering
    useEffect(() => {
        if (fileBlob && containerRef.current) {
            containerRef.current.innerHTML = ''; // Clear previous content
            renderAsync(fileBlob, containerRef.current, containerRef.current, {
                className: "docx-viewer",
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
            }).catch(err => {
                console.error("Failed to render DOCX:", err);
            });
        }
    }, [fileBlob]);

    // Ctrl + Scroll Zoom
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setZoomLevel(prev => {
                    const delta = -e.deltaY;
                    const step = 0.1;

                    if (delta > 0) {
                        return Math.min(prev + step, 3.0);
                    } else {
                        return Math.max(prev - step, 0.5);
                    }
                });
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 3.0));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
    const handleResetZoom = () => setZoomLevel(1);

    const handleBack = () => {
        navigate("/documents");
    };

    const renderContent = () => {
        if (!document) return null;

        if (document.type === 'docs') {
            return (
                <div
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 overflow-auto h-full bg-gray-100 dark:bg-gray-900 flex"
                >
                    <div
                        // Use CSS zoom for better layout flow handling (works in Chrome/Edge/Safari)
                        // This ensures scrollbars appear correctly and content isn't clipped
                        style={{ zoom: zoomLevel } as any}
                        className="m-auto"
                    >
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 0 01.707.293l5.414 5.414a1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <p className="text-lg text-gray-500 mb-4">Không thể hiển thị nội dung file này trực tiếp.</p>
                    <div className="flex justify-center">
                        <button
                            className="btn-primary"
                            onClick={() => navigate("/documents")}
                        >
                            Quay lại danh sách
                        </button>
                    </div>
                </div>
            )
        }

        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-auto h-full">
                <pre
                    className="whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-300 transition-all duration-200"
                    style={{ fontSize: `${0.875 * zoomLevel}rem` }}
                >
                    {document.content}
                </pre>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                    <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mb-2">Đã xảy ra lỗi</h3>
                    <p className="text-red-600 dark:text-red-300 mb-4">{error}</p>
                    <button onClick={handleBack} className="btn-secondary">
                        Quay lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container-fluid px-4 py-6 h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 flex-shrink-0 gap-3 sm:gap-4">
                <div className="flex items-center gap-4 w-full sm:flex-1 min-w-0">
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
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white break-words flex-1 min-w-0">
                            {document.name}
                        </h1>
                    )}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-2 bg-white dark:bg-gray-800 rounded-lg p-1.5 sm:p-2 shadow-sm border border-gray-200 dark:border-gray-700 w-full sm:w-auto">
                    <div className="flex items-center gap-1 sm:gap-2">
                        <button
                            onClick={handleZoomOut}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-400"
                            title="Thu nhỏ"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                        </button>

                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="0.5"
                                max="3.0"
                                step="0.1"
                                value={zoomLevel}
                                onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                                className="w-16 sm:w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                            />
                            <span className="w-10 sm:w-12 text-center text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {Math.round(zoomLevel * 100)}%
                            </span>
                        </div>

                        <button
                            onClick={handleZoomIn}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-400"
                            title="Phóng to"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                    <button
                        onClick={handleResetZoom}
                        className="px-2 py-1 ml-1 text-xs font-medium text-gray-500 hover:text-primary-600 border-l border-gray-200 dark:border-gray-600 whitespace-nowrap"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Content Viewer - Full height */}
            <div className="flex-1 overflow-hidden">
                {renderContent()}
            </div>
        </div>
    );
};

export default DocumentViewerPage;
