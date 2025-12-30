import React, { useEffect, useState, useRef } from 'react';

interface ImageModalProps {
    imageUrl: string;
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Modal component for viewing images in full screen
 * Features:
 * - Click outside to close
 * - ESC key to close
 * - Close button (X)
 * - Smooth animations
 * - Dark mode support
 * - Zoom In/Out/Reset support
 * - Pan (Drag) support when zoomed
 * - Mouse Wheel Zoom support
 */
const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, isOpen, onClose }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const onCloseRef = useRef(onClose);

    // Keep onClose ref updated
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    // Handle ESC key press
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
            }
        };

        document.addEventListener('keydown', handleEscape);
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Handle Wheel Zoom
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (isOpen) {
                e.preventDefault();
                setScale(prev => {
                    const delta = -e.deltaY;
                    const step = 0.1;
                    let newScale = prev;

                    if (delta > 0) {
                        newScale = Math.min(prev + step, 5.0);
                    } else {
                        newScale = Math.max(prev - step, 0.5);
                    }

                    // Reset position if zoomed out to normal or less
                    if (newScale <= 1) {
                        setPosition({ x: 0, y: 0 });
                    }

                    return newScale;
                });
            }
        };

        if (isOpen) {
            window.addEventListener('wheel', handleWheel, { passive: false });
        }

        return () => {
            window.removeEventListener('wheel', handleWheel);
        };
    }, [isOpen]);


    const handleZoomIn = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setScale(prev => Math.min(prev + 0.25, 5.0));
    };

    const handleZoomOut = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setScale(prev => {
            const newScale = Math.max(prev - 0.25, 0.5);
            if (newScale <= 1) setPosition({ x: 0, y: 0 });
            return newScale;
        });
    };

    const handleResetZoom = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    // Drag / Pan Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            e.preventDefault();
            setIsDragging(true);
            dragStart.current = {
                x: e.clientX - position.x,
                y: e.clientY - position.y
            };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            e.preventDefault();
            setPosition({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    }


    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm animate-fadeIn"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Image viewer"
        >
            {/* Controls Bar */}
            <div
                className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-gray-900/80 p-2 rounded-full shadow-lg z-50 backdrop-blur-md border border-gray-700/50"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={handleZoomOut}
                    className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-full transition-colors"
                    title="Thu nhỏ (-)"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>

                <span className="min-w-[3rem] text-center text-sm font-medium text-white tabular-nums">
                    {Math.round(scale * 100)}%
                </span>

                <button
                    onClick={handleZoomIn}
                    className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-full transition-colors"
                    title="Phóng to (+)"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>

                <div className="w-px h-6 bg-gray-700 mx-1"></div>

                <button
                    onClick={handleResetZoom}
                    className="px-3 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-full transition-colors whitespace-nowrap"
                    title="Đặt lại kích thước (Reset)"
                >
                    Reset
                </button>

                <div className="w-px h-6 bg-gray-700 mx-1"></div>

                <button
                    onClick={onClose}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-full transition-colors"
                    title="Đóng (ESC)"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            {/* Image Container */}
            <div
                className="relative w-full h-full flex items-center justify-center overflow-hidden"
                onClick={(e) => {
                    // Only close if not clicking on image or while dragging
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <img
                    src={imageUrl}
                    alt="Xem ảnh"
                    className="max-w-none max-h-none transition-transform duration-100 ease-out origin-center"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        maxWidth: scale === 1 ? '90vw' : 'auto',
                        maxHeight: scale === 1 ? '90vh' : 'auto',
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => e.stopPropagation()}
                    draggable={false} // Disable native drag
                />
            </div>

            {/* Helper text - Only show when standard view */}
            {scale === 1 && (
                <div className="absolute bottom-6 left-0 right-0 text-center text-white/50 text-xs pointer-events-none">
                    Cuộn chuột để phóng to • Kéo để di chuyển • ESC để đóng
                </div>
            )}
        </div>
    );
};

export default ImageModal;
