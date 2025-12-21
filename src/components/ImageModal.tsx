import React, { useEffect } from 'react';

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
 */
const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, isOpen, onClose }) => {
    // Handle ESC key press
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm animate-fadeIn"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Image viewer"
        >
            {/* Modal Content */}
            <div
                className="relative max-w-[90vw] max-h-[90vh] animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors shadow-lg z-10"
                    aria-label="Đóng"
                    title="Đóng (ESC)"
                >
                    <svg
                        className="w-6 h-6"
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

                {/* Image */}
                <img
                    src={imageUrl}
                    alt="Xem ảnh"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                />

                {/* Helper text */}
                <div className="absolute -bottom-10 left-0 right-0 text-center text-white text-sm opacity-75">
                    Click bên ngoài hoặc nhấn ESC để đóng
                </div>
            </div>
        </div>
    );
};

export default ImageModal;
