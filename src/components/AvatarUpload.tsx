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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        // Read and display image
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

    const handdleSaveAvatar = async () => {
        try {
            setUploading(true);

            const croppedBlob = await getCroppedImg();
            if (!croppedBlob) {
                toast.error('Không thể crop ảnh');
                return;
            }

            // Create FormData and append the cropped image
            const formData = new FormData();
            formData.append('avatar', croppedBlob, 'avatar.jpg');

            const token = getToken();
            const response = await fetch(`${API_URL}/profile/avatar`, {
                method: 'POST',
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

    const handleRemoveAvatar = async () => {
        if (!currentAvatarUrl) return;

        try {
            setUploading(true);
            const token = getToken();
            const response = await fetch(`${API_URL}/profile/avatar`, {
                method: 'DELETE',
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Cắt ảnh avatar</h3>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <FaTimes className="text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>

                        {/* Crop Area */}
                        <div className="p-6">
                            {imageSrc && (
                                <ReactCrop
                                    crop={crop}
                                    onChange={(c) => setCrop(c)}
                                    onComplete={(c) => setCompletedCrop(c)}
                                    aspect={1}
                                    circularCrop
                                    className="max-w-full"
                                >
                                    <img
                                        ref={imgRef}
                                        src={imageSrc}
                                        alt="Crop preview"
                                        className="max-w-full h-auto"
                                        onLoad={() => {
                                            // Initialize crop on image load
                                            if (imgRef.current) {
                                                const { width, height } = imgRef.current;
                                                const size = Math.min(width, height) * 0.9;
                                                setCrop({
                                                    unit: 'px',
                                                    width: size,
                                                    height: size,
                                                    x: (width - size) / 2,
                                                    y: (height - size) / 2
                                                });
                                            }
                                        }}
                                    />
                                </ReactCrop>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={handleClose}
                                disabled={uploading}
                                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-all disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handdleSaveAvatar}
                                disabled={uploading || !completedCrop}
                                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploading ? (
                                    <>Đang lưu...</>
                                ) : (
                                    <>
                                        <FaCheck /> Lưu avatar
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
