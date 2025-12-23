import React from 'react';
import { ExtractedImage } from '../types';

interface UnassignedImagesGalleryProps {
    images: ExtractedImage[];
    onImageRemove: (imageId: string) => void;
    onImageRestore?: (source: {
        imageData: string;
        imageId?: string;
        sourceType: 'question' | 'option';
        questionId: string;
        optionText?: string;
    }) => void;
    onImageClick?: (imageUrl: string) => void;
    className?: string;
}

/**
 * Gallery component to display unassigned images
 * Users can drag these images to question/option cards
 */
const UnassignedImagesGallery: React.FC<UnassignedImagesGalleryProps> = ({
    images,
    onImageRemove,
    onImageRestore,
    onImageClick,
    className = '',
}) => {
    const [isDraggingOver, setIsDraggingOver] = React.useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        // Only accept assigned images (from questions/answers)
        const hasAssignedSource = e.dataTransfer.types.includes('image/assigned-source');
        if (!hasAssignedSource) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Only reset if leaving the gallery completely
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);

        const assignedSource = e.dataTransfer.getData('image/assigned-source');
        if (!assignedSource || !onImageRestore) return;

        try {
            const source = JSON.parse(assignedSource);
            onImageRestore(source);
        } catch (error) {
            // console.error('Failed to parse image source:', error);
        }
    };

    if (!images || images.length === 0) {
        return null;  // Hide gallery if no unassigned images
    }

    const handleDragStart = (e: React.DragEvent, image: ExtractedImage) => {
        // Store image ID in drag event
        e.dataTransfer.setData('image/unassigned-id', image.id);
        e.dataTransfer.effectAllowed = 'copyMove';
    };

    return (
        <div
            className={`unassigned-images-gallery ${className} ${isDraggingOver ? 'ring-4 ring-purple-500 ring-opacity-50 bg-purple-50 dark:bg-purple-900/20' : ''
                }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 z-10">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Ảnh chưa gán: {images.length}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Kéo thả ảnh vào câu hỏi hoặc đáp án để gắn ảnh. Click để xem ảnh
                </p>
            </div>

            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-3 h-full overflow-y-auto">
                {images.map((image, index) => (
                    <div
                        key={image.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, image)}
                        className="group relative bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-all cursor-move hover:shadow-md"
                    >
                        {/* Image Preview */}
                        <div className="relative w-full max-w-[227px] mx-auto bg-white dark:bg-gray-800 rounded overflow-hidden">
                            <img
                                src={image.data}
                                alt={`Unassigned ${index + 1}`}
                                className={`w-full h-auto max-h-64 object-contain ${onImageClick ? 'cursor-pointer' : ''}`}
                                onClick={() => onImageClick?.(image.data)}
                            />

                            {/* Drag Indicator */}
                            <div className="absolute top-2 left-2 bg-purple-600 text-white px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                                Kéo
                            </div>

                            {/* Remove Button */}
                            {onImageRemove && (
                                <button
                                    type="button"
                                    onClick={() => onImageRemove(image.id)}
                                    className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg"
                                    title="Xóa ảnh"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Image Info */}
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Ảnh #{index + 1}</span>
                            {image.position !== undefined && (
                                <span className="ml-2">• Thứ tự trong File: {image.position + 1}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Helper Text at Bottom */}
            <div className="sticky bottom-0 bg-gradient-to-t from-white dark:from-gray-800 to-transparent p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    💡 Mẹo: Kéo thả ảnh trong kho vào câu hỏi, đáp án hoặc "Trình chỉnh sửa" để gán ảnh cho câu hỏi hoặc đáp án được chọn
                </p>
            </div>
        </div>
    );
};

export default UnassignedImagesGallery;
