import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';
import { Language } from '../types';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  error: string | null;
  lang: Language;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, error, lang }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  }, [onFileSelect]);
    
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(Array.from(e.target.files));
    }
  };

  return (
    <div className="bg-base-200 p-6 rounded-xl shadow-lg border border-border-color">
      <div 
          className={`relative flex flex-col items-center justify-center p-8 rounded-lg cursor-pointer transition-all duration-300 border-2 border-dashed
            ${isDragging ? 'bg-brand-primary/10 border-brand-primary' : 'border-border-color hover:border-brand-secondary'}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload')?.click()}
      >
        <div className="flex flex-col items-center justify-center text-center pointer-events-none z-10">
          <div className={`mb-4 rounded-full p-4 transition-colors ${isDragging ? 'bg-brand-primary/20' : 'bg-base-300'}`}>
            <UploadIcon className="w-10 h-10 text-brand-secondary" />
          </div>
          <h3 className="text-xl font-semibold text-text-main">{lang === 'vi' ? 'Kéo & thả tệp của bạn vào đây' : 'Drag & drop your file(s) here'}</h3>
          <p className="text-text-subtle mt-1">{lang === 'vi' ? 'hoặc' : 'or'} <span className="font-semibold text-brand-primary">{lang === 'vi' ? 'chọn tệp' : 'browse files'}</span></p>
          <p className="text-xs text-text-subtle mt-4">{lang === 'vi' ? 'Hỗ trợ .docx, .pdf, .txt, hình ảnh & âm thanh' : 'Supports .docx, .pdf, .txt, images & audio'}</p>
        </div>
      </div>
      <input 
        id="file-upload" 
        type="file" 
        className="hidden" 
        accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*,audio/*"
        onChange={handleFileChange}
        aria-label="File upload input"
        multiple
      />
      {error && (
        <div role="alert" className="mt-4 p-3 bg-error-bg text-error-text border border-error-border rounded-md text-sm">
          <strong>{lang === 'vi' ? 'Lỗi:' : 'Error:'}</strong> {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
