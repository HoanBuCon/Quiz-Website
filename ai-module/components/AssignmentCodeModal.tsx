import React, { useState } from 'react';
import { Language } from '../types';
import { CheckIcon } from './icons';

interface AssignmentCodeModalProps {
  code: string;
  onClose: () => void;
  lang: Language;
}

const AssignmentCodeModal: React.FC<AssignmentCodeModalProps> = ({ code, onClose, lang }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-base-200 p-8 rounded-lg shadow-2xl w-full max-w-lg m-4 animate-scale-in text-center">
                <h2 className="text-2xl font-bold mb-2">{lang === 'vi' ? 'Giao bài thành công!' : 'Assignment Created!'}</h2>
                <p className="text-text-subtle mb-6">{lang === 'vi' ? 'Sao chép và chia sẻ dữ liệu này với học viên:' : 'Copy and share this data with your students:'}</p>
                
                <textarea
                    readOnly
                    value={code}
                    rows={6}
                    className="w-full bg-base-100 p-3 rounded-lg border border-border-color text-xs text-text-subtle resize-y"
                    aria-label={lang === 'vi' ? 'Dữ liệu bài tập' : 'Assignment data'}
                />
                
                <div className="flex flex-col gap-3 mt-6">
                    <button 
                        onClick={handleCopy}
                        className={`w-full flex items-center justify-center gap-2 font-bold py-3 px-6 rounded-lg transition-colors text-text-inverted ${copied ? 'bg-green-600' : 'bg-brand-primary hover:bg-brand-primary-hover'}`}
                    >
                        {copied && <CheckIcon className="w-5 h-5"/>}
                        {copied ? (lang === 'vi' ? 'Đã sao chép!' : 'Copied!') : (lang === 'vi' ? 'Sao chép Dữ liệu' : 'Copy Data')}
                    </button>
                    <button 
                        onClick={onClose}
                        className="w-full bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        {lang === 'vi' ? 'Đóng' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignmentCodeModal;