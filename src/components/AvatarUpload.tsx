import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FaTimes, FaUpload, FaTrash, FaCheck } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '../utils/api';
import { getToken } from '../utils/auth';

interface AvatarUploadProps {
    currentAvatarUrl?: string | null;
    onAvatarChange: (newAvatarUrl: string | null) => void;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ currentAvatarUrl, onAvatarChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [imageSrc, setImageSrc] = useState<string>('');
    const [crop, setCrop] = useState<Crop>({
        unit: '%',
        width: 90,
        height: 90,
        x: 5,
        y: 5
    });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [uploading, setUploading] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const API_URL = getApiBaseUrl();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Kích thước file không được vượt quá 10MB');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Chỉ chấp nhận file ảnh');
            return;
        }

        // If GIF, upload directly to preserve animation
        if (file.type === 'image/gif') {
            await uploadAvatarBlob(file);
            return;
        }

        // Read and display image for cropping
        const reader = new FileReader();
        reader.onload = () => {
            setImageSrc(reader.result as string);
            setIsOpen(true);
        };
        reader.readAsDataURL(file);
    };

    const getCroppedImg = useCallback(async (): Promise<Blob | null> => {
        if (!completedCrop || !imgRef.current) return null;

        const image = imgRef.current;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        canvas.width = completedCrop.width;
        canvas.height = completedCrop.height;

        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            completedCrop.width,
            completedCrop.height
        );

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    }, [completedCrop]);

    const uploadAvatarBlob = async (blob: Blob) => {
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('avatar', blob, blob instanceof File ? blob.name : 'avatar.jpg');

            const token = getToken();
            const response = await fetch(`${API_URL}/profile/avatar`, {
                method: 'POST',
                credentials: 'include', // ✅ Enable cookie-based authentication
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            toast.success('Cập nhật avatar thành công!');
            onAvatarChange(data.avatarUrl);
            handleClose();
        } catch (error) {
            console.error('Avatar upload error:', error);
            toast.error('Không thể upload avatar');
        } finally {
            setUploading(false);
        }
    };

    const handdleSaveAvatar = async () => {
        const croppedBlob = await getCroppedImg();
        if (!croppedBlob) {
            toast.error('Không thể crop ảnh');
            return;
        }
        await uploadAvatarBlob(croppedBlob);
    };

    const handleRemoveAvatar = async () => {
        if (!currentAvatarUrl) return;

        try {
            setUploading(true);
            const token = getToken();
            const response = await fetch(`${API_URL}/profile/avatar`, {
                method: 'DELETE',
                credentials: 'include', // ✅ Enable cookie-based authentication
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Delete failed');
            }

            toast.success('Đã gỡ avatar');
            onAvatarChange(null);
        } catch (error) {
            console.error('Avatar delete error:', error);
            toast.error('Không thể gỡ avatar');
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        setImageSrc('');
        setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
        setCompletedCrop(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <>
            {/* Hidden file input */}
            <input
                id="avatar-upload-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Avatar hover overlay - shown by parent */}

            {/* Crop Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden transform transition-all scale-100 animate-scaleIn border border-gray-100 dark:border-gray-700">

                        {/* Header */}
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Cập nhật Avatar</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Kéo khung để chọn vùng hiển thị</p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                            >
                                <FaTimes className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Crop Area */}
                        <div className="p-8 flex justify-center bg-gray-50 dark:bg-gray-900/50">
                            {imageSrc && (
                                <div className="shadow-2xl">
                                    <ReactCrop
                                        crop={crop}
                                        onChange={(c) => setCrop(c)}
                                        onComplete={(c) => setCompletedCrop(c)}
                                        aspect={1}
                                        circularCrop
                                        keepSelection
                                        className="max-w-full max-h-[50vh]"
                                    >
                                        <img
                                            ref={imgRef}
                                            src={imageSrc}
                                            alt="Crop preview"
                                            className="max-w-full h-auto object-contain max-h-[50vh]"
                                            onLoad={() => {
                                                // Initialize crop on image load
                                                if (imgRef.current) {
                                                    const { width, height } = imgRef.current;
                                                    const size = Math.min(width, height) * 0.8;
                                                    const pixelCrop = {
                                                        unit: 'px' as const,
                                                        width: size,
                                                        height: size,
                                                        x: (width - size) / 2,
                                                        y: (height - size) / 2
                                                    };
                                                    setCrop(pixelCrop);
                                                    setCompletedCrop(pixelCrop);
                                                }
                                            }}
                                        />
                                    </ReactCrop>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-6 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={handleClose}
                                disabled={uploading}
                                className="px-6 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={handdleSaveAvatar}
                                disabled={uploading || !completedCrop}
                                className="flex items-center gap-2 px-8 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {uploading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Đang lưu...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Lưu thay đổi</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AvatarUpload;