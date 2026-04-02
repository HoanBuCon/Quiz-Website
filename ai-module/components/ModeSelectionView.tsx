import React from 'react';
import { Language, GenerationMode } from '../types';
import { TasksIcon, BookOpenIcon } from './icons';

interface ModeSelectionViewProps {
  onSelectMode: (mode: GenerationMode) => void;
  onCancel: () => void;
  lang: Language;
  fileCount: number;
}

const ModeSelectionView: React.FC<ModeSelectionViewProps> = ({ onSelectMode, onCancel, lang, fileCount }) => {
  const isExtractDisabled = fileCount > 1;

  return (
    <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg animate-fade-in space-y-6 max-w-4xl w-full mx-auto border border-border-color">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{lang === 'vi' ? 'Chọn chế độ tạo Quiz' : 'Select Quiz Creation Mode'}</h2>
        <p className="text-text-subtle mt-1">{lang === 'vi' ? 'Bạn muốn AI làm gì với các tệp đã tải lên?' : 'What would you like the AI to do with the uploaded files?'}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSelectMode('extract')}
            disabled={isExtractDisabled}
            className={`group text-left p-6 rounded-lg border-2  transition-all space-y-2 h-full ${isExtractDisabled ? 'opacity-50 cursor-not-allowed bg-base-100 border-border-color' : 'border-border-color hover:border-brand-primary hover:bg-brand-primary/5'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg transition-colors ${isExtractDisabled ? 'bg-base-300' : 'bg-base-300 group-hover:bg-brand-primary/20'}`}>
                <TasksIcon className={`w-8 h-8 transition-colors ${isExtractDisabled ? 'text-text-subtle' : 'text-brand-primary'}`} />
              </div>
              <h3 className={`text-xl font-bold text-text-main transition-colors ${!isExtractDisabled ? 'group-hover:text-brand-primary' : ''}`}>
                {lang === 'vi' ? 'Trích xuất từ đề thi' : 'Extract from Document'}
              </h3>
            </div>
            <p className="text-sm text-text-subtle">
              {lang === 'vi' ? 'Lý tưởng cho các tệp .docx hoặc .pdf đã chứa sẵn câu hỏi và đáp án (ví dụ: đề thi). AI sẽ trích xuất chúng để tạo thành một bài kiểm tra tương tác.' : 'Ideal for .docx or .pdf files that already contain questions and answers (e.g., a test paper). The AI will pull them out to create an interactive quiz.'}
            </p>
          </button>
          {isExtractDisabled && (
            <p className="text-xs text-yellow-400 text-center">
                {lang === 'vi' ? 'Chế độ này chỉ hỗ trợ 1 tệp.' : 'This mode only supports 1 file.'}
            </p>
          )}
        </div>

        <button
          onClick={() => onSelectMode('theory')}
          className="group text-left p-6 rounded-lg border-2 border-border-color hover:border-brand-primary hover:bg-brand-primary/5 transition-all space-y-2 h-full"
        >
          <div className="flex items-center gap-3">
            <div className="bg-base-300 group-hover:bg-brand-primary/20 p-3 rounded-lg transition-colors">
              <BookOpenIcon className="w-8 h-8 text-brand-primary transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-text-main group-hover:text-brand-primary transition-colors">
              {lang === 'vi' ? 'Tạo từ lý thuyết' : 'Generate from Theory'}
            </h3>
          </div>
          <p className="text-sm text-text-subtle">
            {lang === 'vi' ? 'Lý tưởng cho các tài liệu học tập, ghi chú, hoặc file âm thanh/hình ảnh. AI sẽ tự tạo ra các câu hỏi hoàn toàn mới dựa trên nội dung bạn cung cấp.' : 'Ideal for study materials, notes, or audio/image files. The AI will create brand new questions from scratch based on the content you provide.'}
          </p>
        </button>
      </div>
      
      <div className="pt-4 border-t border-border-color">
         <button 
            onClick={onCancel}
            className="w-full sm:w-auto bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors"
        >
            {lang === 'vi' ? 'Hủy' : 'Cancel'}
        </button>
      </div>
    </div>
  );
};

export default ModeSelectionView;