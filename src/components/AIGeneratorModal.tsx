import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import SpinnerLoading from './SpinnerLoading';
import { getToken } from '../utils/auth'; // Ensure token is passed
import { getApiBaseUrl } from '../utils/api';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuestionsGenerated: (questions: any[], textContent?: string | null) => void;
}

export default function AIGeneratorModal({ isOpen, onClose, onQuestionsGenerated }: AIGeneratorModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'extract' | 'theory'>('extract');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['multiple-choice']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  if (!isOpen) return null;

  const handleCancel = () => {
    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      return;
    }
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleGenerate = async () => {
    if (files.length === 0) {
      toast.error('Vui lòng chọn ít nhất một file (PDF, DOCX, TXT)');
      return;
    }
    // Only require type selection for theory mode; extract mode uses all types automatically
    if (mode === 'theory' && selectedTypes.length === 0) {
      toast.error('Vui lòng chọn ít nhất một loại câu hỏi');
      return;
    }

    setLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const config = {
        generationMode: mode,
        // In extract mode, include all types so the AI can pick freely; in theory, use selection
        selectedTypes: mode === 'extract' ? ['multiple-choice', 'multi-true-false', 'short-answer', 'drag'] : selectedTypes,
        lang: 'vi',
        modelName: 'gemini-flash-latest',
        shouldGenerateExplanations: true,
        useWebSearch: false,
        questionCountModes: {},
        customQuestionCounts: {},
        difficultyLevels: {
          'multiple-choice': ['recognition', 'comprehension', 'application'],
          'multi-true-false': ['recognition', 'comprehension'],
          'short-answer': ['recognition']
        },
        difficultyCountModes: {},
        difficultyCounts: {}
      };

      formData.append('config', JSON.stringify(config));

      const token = getToken();
      const API_URL = getApiBaseUrl();

      const response = await fetch(`${API_URL}/ai/generate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Lỗi khi tạo quiz từ AI');
      }

      const data = await response.json();

      if (data.textContent) {
        // Theory mode: AI returned raw text in the standard format → pass directly
        onQuestionsGenerated([], data.textContent);
      } else {
        // Extract mode: AI returned JSON questions array
        onQuestionsGenerated(data.questions || [], null);
      }

      toast.success('Tạo câu hỏi thành công!');
      onClose();
      setFiles([]);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.success('Đã hủy quá trình tạo quiz');
      } else {
        console.error(error);
        toast.error(error.message || 'Có lỗi xảy ra trong quá trình xử lý.');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fadeIn">
            <div className="scale-50 mb-4">
              <SpinnerLoading />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></div>
              <span className="text-xl font-mono font-bold text-gray-700 dark:text-gray-200">Đang xử lý...</span>
            </div>
            <button
              onClick={handleCancel}
              className="mt-6 px-6 py-2 rounded-full bg-gray-100/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-gray-600/80 transition-colors text-sm font-medium"
            >
              Hủy
            </button>
          </div>
        )}

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Tạo bài kiểm tra bằng AI
            </h2>
            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* File Upload Region */}
            <div
              className={`group border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${files.length > 0 ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 active:border-primary-500 dark:active:border-primary-400'}`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                accept=".txt,.pdf,.docx"
                onChange={handleFileChange}
              />
              <svg className={`mx-auto h-12 w-12 mb-3 transition-colors ${files.length > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 group-hover:text-primary-500 dark:group-hover:text-primary-400 group-active:text-primary-600 dark:group-active:text-primary-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {files.length > 0 ? (
                <div className="text-sm font-medium text-primary-600 dark:text-primary-400">
                  Đã chọn {files.length} file: {files.map(f => f.name).join(', ')}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Kéo thả File vào đây hoặc click để chọn File</p>
                  <p className="text-xs text-gray-500 mt-1">Hỗ trợ PDF, DOCX, TXT</p>
                </>
              )}
            </div>

            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Chọn chế độ</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  className={`p-4 rounded-lg border text-left transition-all ${mode === 'extract' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}
                  onClick={() => setMode('extract')}
                >
                  <svg className={`w-6 h-6 mb-2 ${mode === 'extract' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <div className="font-semibold text-gray-900 dark:text-white mb-1">Trích xuất câu hỏi</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">AI sẽ đọc tài liệu bộ đề đã có cấu trúc, tự động bóc tách thành câu hỏi.</div>
                </button>
                <button
                  className={`p-4 rounded-lg border text-left transition-all ${mode === 'theory' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'}`}
                  onClick={() => setMode('theory')}
                >
                  <svg className={`w-6 h-6 mb-2 ${mode === 'theory' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <div className="font-semibold text-gray-900 dark:text-white mb-1">Tạo từ tài liệu lý thuyết</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">AI sẽ đọc tài liệu và nghiên cứu lý thuyết để tự sinh câu hỏi.</div>
                </button>
              </div>
            </div>

            {/* Types Selection - only relevant for theory mode */}
            {mode === 'theory' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Loại câu hỏi {selectedTypes.length > 0 ? `(Đã chọn ${selectedTypes.length})` : '(Chọn nhiều)'}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${selectedTypes.includes('multiple-choice') ? 'bg-primary-100 text-primary-700 border-primary-500 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-400' : 'bg-gray-100 text-gray-600 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                    onClick={() => toggleType('multiple-choice')}
                  >
                    Trắc nghiệm
                  </button>
                  <button
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${selectedTypes.includes('multi-true-false') ? 'bg-primary-100 text-primary-700 border-primary-500 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-400' : 'bg-gray-100 text-gray-600 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                    onClick={() => toggleType('multi-true-false')}
                  >
                    Đúng/Sai
                  </button>
                  <button
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${selectedTypes.includes('short-answer') ? 'bg-primary-100 text-primary-700 border-primary-500 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-400' : 'bg-gray-100 text-gray-600 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                    onClick={() => toggleType('short-answer')}
                  >
                    Trả lời ngắn
                  </button>
                  <button
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${selectedTypes.includes('drag') ? 'bg-primary-100 text-primary-700 border-primary-500 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-400' : 'bg-gray-100 text-gray-600 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                    onClick={() => toggleType('drag')}
                  >
                    Kéo thả
                  </button>
                </div>
              </div>
            )}

          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleGenerate}
              className="px-6 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 flex items-center gap-2 transition-colors"
            >
              Tạo Quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
