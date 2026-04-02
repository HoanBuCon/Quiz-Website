import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Language, SelectableQuestionType, KnowledgeBase, KnowledgeEntry, GeminiModel, GenerationMode, CustomQuestionCountModes, CustomQuestionCounts, DifficultyLevel, DifficultyLevels, DifficultyCountModes, DifficultyCounts } from '../types';
import { CheckBadgeIcon, ListBulletIcon, PencilSquareIcon, CheckIcon, SparklesIcon, FileTypeIcon, CloseIcon, UploadIcon, ExclamationTriangleIcon } from './icons';

interface QuizTypeSelectionViewProps {
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  generationMode: GenerationMode;
  knowledgeBases: KnowledgeBase[];
  knowledgeEntries: KnowledgeEntry[];
  onConfirm: (
    quizTitle: string,
    selectedTypes: SelectableQuestionType[], 
    shouldGenerateExplanations: boolean,
    selectedEntryIds: string[],
    integrateGeneralAI: boolean,
    selectedModel: GeminiModel,
    useWebSearch: boolean,
    generationMode: GenerationMode,
    questionCountModes: CustomQuestionCountModes,
    customQuestionCounts: CustomQuestionCounts,
    difficultyLevels: DifficultyLevels,
    difficultyCountModes: DifficultyCountModes,
    difficultyCounts: DifficultyCounts
  ) => void;
  onCancel: () => void;
  lang: Language;
  setZoomedImageUrl: (url: string | null) => void;
}

const typeOptions: { type: SelectableQuestionType; icon: React.FC<any>; vi: string; en: string }[] = [
    { type: 'multiple-choice', icon: ListBulletIcon, vi: 'Trắc nghiệm (1 đáp án)', en: 'Multiple Choice (1 answer)' },
    { type: 'multi-true-false', icon: CheckBadgeIcon, vi: 'Nhiều Đúng/Sai', en: 'Multi True/False' },
    { type: 'short-answer', icon: PencilSquareIcon, vi: 'Trả lời ngắn', en: 'Short Answer' }
];

const difficultyOptions: { level: DifficultyLevel; vi: string; en: string }[] = [
    { level: 'recognition', vi: 'Nhận biết', en: 'Recognition' },
    { level: 'comprehension', vi: 'Thông hiểu', en: 'Comprehension' },
    { level: 'application', vi: 'Vận dụng', en: 'Application' },
];


const ToggleSwitch: React.FC<{
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ label, description, enabled, onChange }) => (
  <label htmlFor={label} className="flex items-center justify-between cursor-pointer bg-base-100 p-4 rounded-lg border border-border-color">
    <div>
        <span className="font-semibold text-text-main">{label}</span>
        {description && <p className="text-sm text-text-subtle">{description}</p>}
    </div>
    <div className="relative flex-shrink-0">
      <input 
        id={label}
        type="checkbox" 
        className="sr-only" 
        checked={enabled} 
        onChange={(e) => onChange(e.target.checked)} 
      />
      <div className={`block w-14 h-8 rounded-full transition-colors ${enabled ? 'bg-brand-primary' : 'bg-base-300'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${enabled ? 'transform translate-x-6' : ''}`}></div>
    </div>
  </label>
);

const ModelOption: React.FC<{
    model: GeminiModel;
    label: string;
    description: string;
    selectedModel: GeminiModel;
    onSelect: (model: GeminiModel) => void;
}> = ({ model, label, description, selectedModel, onSelect }) => {
    const isSelected = model === selectedModel;
    return (
        <button
            onClick={() => onSelect(model)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${isSelected ? 'bg-brand-primary/10 border-brand-primary shadow-md' : 'bg-base-100 border-border-color hover:border-brand-secondary'}`}
            role="radio"
            aria-checked={isSelected}
        >
            <div className="flex items-center">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mr-3 ${isSelected ? 'border-brand-primary bg-brand-primary' : 'border-border-color'}`}>
                    {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <div>
                    <h4 className="font-bold text-text-main">{label}</h4>
                    <p className="text-sm text-text-subtle">{description}</p>
                </div>
            </div>
        </button>
    );
};


const QuizTypeSelectionView: React.FC<QuizTypeSelectionViewProps> = (props) => {
    const { files, onAddFiles, onRemoveFile, generationMode, knowledgeBases, knowledgeEntries, onConfirm, onCancel, lang, setZoomedImageUrl } = props;

    const [quizTitle, setQuizTitle] = useState(files[0]?.name.replace(/\.[^/.]+$/, "") || (lang === 'vi' ? "Quiz không tên" : "Untitled Quiz"));
    const [questionCountModes, setQuestionCountModes] = useState<CustomQuestionCountModes>({});
    const [customQuestionCounts, setCustomQuestionCounts] = useState<CustomQuestionCounts>({
        'multiple-choice': 10, 'multi-true-false': 5, 'short-answer': 5,
    });
    const [selectedTypes, setSelectedTypes] = useState<Set<SelectableQuestionType>>(new Set(Object.keys(customQuestionCounts) as SelectableQuestionType[]));
    const [shouldGenerateExplanations, setShouldGenerateExplanations] = useState(true);
    const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string>('__general__');
    const [integrateGeneralAI, setIntegrateGeneralAI] = useState(true);
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
    const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-flash-latest');
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previews, setPreviews] = useState<string[]>([]);

    // New state for difficulty levels
    const [difficultyLevels, setDifficultyLevels] = useState<DifficultyLevels>({
        'multiple-choice': new Set(['recognition', 'comprehension']),
        'multi-true-false': new Set(['recognition']),
        'short-answer': new Set(['recognition'])
    });
    const [difficultyCountModes, setDifficultyCountModes] = useState<DifficultyCountModes>({});
    const [difficultyCounts, setDifficultyCounts] = useState<DifficultyCounts>({});


    const [showDisabledWarning, setShowDisabledWarning] = useState(false);
    const warningTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const urls = files.map(file => {
            if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
                try {
                    return URL.createObjectURL(file);
                } catch (e) {
                    console.error("Error creating object URL for preview:", e);
                    return '';
                }
            }
            return '';
        });
        setPreviews(urls);

        return () => {
            urls.forEach(url => {
                if (url) URL.revokeObjectURL(url);
            });
        };
    }, [files]);

    useEffect(() => {
        // Cleanup timeout on unmount
        return () => {
            if (warningTimeoutRef.current) {
                clearTimeout(warningTimeoutRef.current);
            }
        };
    }, []);

    const entriesForKb = React.useMemo(() => {
        if (selectedKnowledgeBaseId === '__general__' || selectedKnowledgeBaseId === '__all__') {
            return [];
        }
        return knowledgeEntries.filter(e => e.knowledgeBaseId === selectedKnowledgeBaseId);
    }, [selectedKnowledgeBaseId, knowledgeEntries]);

    useEffect(() => {
        // Reset entry selections when the knowledge base changes
        setSelectedEntryIds(new Set());
    }, [selectedKnowledgeBaseId]);


    const handleToggleType = (type: SelectableQuestionType) => {
        setSelectedTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(type)) {
                newSet.delete(type);
            } else {
                newSet.add(type);
                 // Default to auto when a type is newly selected
                if (questionCountModes[type] === undefined) {
                    setQuestionCountModes(prevModes => ({...prevModes, [type]: 'auto'}));
                }
                 if (difficultyLevels[type] === undefined) {
                    setDifficultyLevels(prev => ({...prev, [type]: new Set(['recognition'])}));
                }
            }
            return newSet;
        });
    };
    
    const handleToggleEntry = (entryId: string) => {
        setSelectedEntryIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(entryId)) {
                newSet.delete(entryId);
            } else {
                newSet.add(entryId);
            }
            return newSet;
        });
    };
    
    const handleToggleSelectAllEntries = () => {
        if (selectedEntryIds.size === entriesForKb.length) {
            setSelectedEntryIds(new Set());
        } else {
            setSelectedEntryIds(new Set(entriesForKb.map(e => e.id)));
        }
    };
    
    const handleAddFilesClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            if (generationMode === 'extract') {
                // Replace logic: remove the current file and add the new one.
                if (files.length > 0) {
                    onRemoveFile(0);
                }
                onAddFiles([e.target.files[0]]);
            } else {
                onAddFiles(Array.from(e.target.files));
            }
        }
    };

    const isConfirmDisabled = useMemo(() => {
        if (files.length === 0 || selectedTypes.size === 0) {
            return true;
        }
        if (generationMode === 'theory') {
            for (const type of selectedTypes) {
                // Rule: If total count is custom, it must be > 0
                if (questionCountModes[type] === 'custom' && (!customQuestionCounts[type] || customQuestionCounts[type] <= 0)) {
                    return true;
                }
                
                const selectedDifficulties = difficultyLevels[type];
                // Rule: At least one difficulty level must be selected
                if (!selectedDifficulties || selectedDifficulties.size === 0) {
                    return true;
                }

                let customDifficultySum = 0;

                for (const level of selectedDifficulties) {
                    // Rule: If a difficulty count is custom, it must be > 0
                    if (difficultyCountModes[type]?.[level] === 'custom') {
                        const count = difficultyCounts[type]?.[level] || 0;
                        if (count <= 0) {
                            return true;
                        }
                        customDifficultySum += count;
                    }
                }
                
                // Rule: If total count is custom, the sum of custom difficulty counts cannot exceed it
                const totalCustomCount = customQuestionCounts[type] || 0;
                if (questionCountModes[type] === 'custom' && customDifficultySum > totalCustomCount) {
                    return true;
                }
            }
        }
        return false;
    }, [files.length, selectedTypes, generationMode, questionCountModes, customQuestionCounts, difficultyLevels, difficultyCountModes, difficultyCounts]);


    const handleConfirm = () => {
        if (isConfirmDisabled) {
            triggerDisabledWarning();
            // You can also show a more specific error message here if you want
            return;
        }
        setLocalError(null);

        let finalEntryIds: string[] = [];
        if (shouldGenerateExplanations) {
            if (selectedKnowledgeBaseId === '__all__') {
                finalEntryIds = knowledgeEntries.map(e => e.id);
            } else if (selectedKnowledgeBaseId !== '__general__') {
                finalEntryIds = Array.from(selectedEntryIds);
            }
        }
        
        const shouldIntegrate = selectedKnowledgeBaseId === '__general__' || integrateGeneralAI;
        onConfirm(quizTitle, Array.from(selectedTypes), shouldGenerateExplanations, finalEntryIds, shouldIntegrate, selectedModel, useWebSearch, generationMode, questionCountModes, customQuestionCounts, difficultyLevels, difficultyCountModes, difficultyCounts);
    };

     const handleCountChange = (type: SelectableQuestionType, value: string) => {
        const count = parseInt(value, 10);
        setCustomQuestionCounts(prev => ({
            ...prev,
            [type]: isNaN(count) || count < 0 ? 0 : count,
        }));
    };
     
    const handleModeChange = (type: SelectableQuestionType, mode: 'auto' | 'custom') => {
        setQuestionCountModes(prev => ({...prev, [type]: mode}));
    }

    const handleDifficultyLevelToggle = (type: SelectableQuestionType, level: DifficultyLevel) => {
        setDifficultyLevels(prev => {
            const newLevels = { ...prev };
            const typeLevels = new Set(newLevels[type]);
            if (typeLevels.has(level)) {
                typeLevels.delete(level);
            } else {
                typeLevels.add(level);
            }
            newLevels[type] = typeLevels;
            return newLevels;
        });
    };
    
    const handleDifficultyModeChange = (type: SelectableQuestionType, level: DifficultyLevel, mode: 'auto' | 'custom') => {
        setDifficultyCountModes(prev => {
            const newModes = { ...prev };
            if (!newModes[type]) newModes[type] = {};
            newModes[type]![level] = mode;
            return newModes;
        });
    };
    
   const handleDifficultyCountChange = (type: SelectableQuestionType, level: DifficultyLevel, value: string) => {
        const newCount = parseInt(value, 10) || 0;
        setDifficultyCounts(prev => {
            const newCounts = JSON.parse(JSON.stringify(prev)); // Deep copy to avoid mutation issues
            if (!newCounts[type]) {
                newCounts[type] = {};
            }
            newCounts[type][level] = newCount < 0 ? 0 : newCount; // Don't allow negative numbers
            return newCounts;
        });
    };


    const triggerDisabledWarning = () => {
        if (warningTimeoutRef.current) {
            clearTimeout(warningTimeoutRef.current);
        }
        setShowDisabledWarning(true);
        warningTimeoutRef.current = window.setTimeout(() => {
            setShowDisabledWarning(false);
        }, 3000);
    };
    
    return (
        <>
             {showDisabledWarning && (
                <div role="alert" className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-base-200/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-yellow-500/50 flex items-center gap-2 text-yellow-400 text-sm animate-slide-in-top">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    <span>{lang === 'vi' ? 'Vui lòng nhập đầy đủ để tạo' : 'Please complete all required fields to generate.'}</span>
                </div>
            )}
            <div className="bg-base-200 p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-2xl m-4 animate-scale-in space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin border border-border-color">
                <div>
                    <h2 className="text-2xl font-bold text-text-main">
                        {lang === 'vi' ? 'Cấu hình tạo Quiz' : 'Configure Quiz Generation'}
                    </h2>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold text-text-main">{lang === 'vi' ? '1. Tệp đã tải lên' : '1. Uploaded Files'}</h3>
                    <div className="bg-base-100 p-3 rounded-lg space-y-2 border border-border-color">
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                            {files.map((file, index) => {
                                const previewUrl = previews[index];
                                const isImage = file.type.startsWith('image/');
                                const isAudio = file.type.startsWith('audio/');
                                return (
                                    <div key={`${file.name}-${index}`} className="bg-base-300 p-2 rounded-md flex flex-col animate-fade-in">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileTypeIcon fileName={file.name} />
                                                <span className="truncate text-sm text-text-main" title={file.name}>{file.name}</span>
                                            </div>
                                            <button onClick={() => onRemoveFile(index)} className="p-1 rounded-full hover:bg-base-100 flex-shrink-0">
                                                <CloseIcon className="w-4 h-4 text-text-subtle"/>
                                            </button>
                                        </div>
                                        {previewUrl && (isImage || isAudio) && (
                                            <div className="mt-2 p-2 bg-base-100 rounded">
                                                {isImage && <img src={previewUrl} alt={file.name} className="max-h-48 w-auto mx-auto rounded cursor-pointer" onClick={() => setZoomedImageUrl(previewUrl)} />}
                                                {isAudio && <audio src={previewUrl} controls className="w-full h-10" />}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        {generationMode === 'extract' ? (
                            <button onClick={handleAddFilesClick} className="w-full flex items-center justify-center gap-2 text-sm p-2 rounded-md bg-base-300 hover:bg-base-300-hover transition-colors">
                                <UploadIcon className="w-4 h-4"/>
                                {lang === 'vi' ? 'Thay đổi tệp' : 'Change File'}
                            </button>
                        ) : (
                            <button onClick={handleAddFilesClick} className="w-full flex items-center justify-center gap-2 text-sm p-2 rounded-md bg-base-300 hover:bg-base-300-hover transition-colors">
                                <UploadIcon className="w-4 h-4"/>
                                {lang === 'vi' ? 'Thêm tệp' : 'Add Files'}
                            </button>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple={generationMode !== 'extract'} hidden accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*,audio/*" />
                    </div>
                    <div className="mt-2">
                        <label htmlFor="quiz-title-input" className="block text-sm font-medium text-text-subtle mb-1">
                            {lang === 'vi' ? 'Tiêu đề Quiz' : 'Quiz Title'}
                        </label>
                        <input
                            id="quiz-title-input"
                            type="text"
                            value={quizTitle}
                            onChange={(e) => setQuizTitle(e.target.value)}
                            className="w-full bg-base-300 p-2 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                            onFocus={e => e.target.select()}
                        />
                    </div>
                </div>
                
                <div className="space-y-3">
                    <h3 className="font-semibold text-text-main">{lang === 'vi' ? '2. Chọn loại câu hỏi & Mức độ' : '2. Select Question Types & Difficulty'}</h3>
                    
                    {typeOptions.map(({ type, icon: Icon, vi, en }) => {
                        const isSelected = selectedTypes.has(type);
                        const isCustomMode = questionCountModes[type] === 'custom';
                        const totalCustomCount = customQuestionCounts[type] || 0;
                        const selectedDifficultyLevels = difficultyLevels[type] || new Set();

                        return (
                            <div key={type} className={`p-3 rounded-lg border-2 transition-all ${isSelected ? 'bg-base-100 border-brand-primary/50' : 'bg-base-100 border-border-color'}`}>
                                <div onClick={() => handleToggleType(type)} className="flex items-center gap-4 cursor-pointer" role="checkbox" aria-checked={isSelected}>
                                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-brand-primary border-brand-secondary' : 'bg-base-300 border-border-color'}`}>
                                        {isSelected && <CheckIcon className="w-4 h-4 text-white"/>}
                                    </div>
                                    <Icon className={`w-6 h-6 flex-shrink-0 ${isSelected ? 'text-brand-primary' : 'text-text-subtle'}`}/>
                                    <span className="font-semibold text-text-main">{lang === 'vi' ? vi : en}</span>
                                </div>
                                
                                {generationMode === 'theory' && isSelected && (
                                    <div className="pl-10 pt-3 mt-3 border-t border-border-color space-y-4 animate-fade-in">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">{lang === 'vi' ? 'Số lượng' : 'Count'}</span>
                                            <div className="flex items-center gap-1 bg-base-300 p-1 rounded-md">
                                                <button onClick={() => handleModeChange(type, 'auto')} className={`px-2 py-1 text-xs rounded ${questionCountModes[type] !== 'custom' ? 'bg-base-200 shadow-sm text-text-main font-semibold' : 'text-text-subtle'}`}>
                                                    {lang === 'vi' ? 'Tự động' : 'Auto'}
                                                </button>
                                                <button onClick={() => handleModeChange(type, 'custom')} className={`px-2 py-1 text-xs rounded ${isCustomMode ? 'bg-base-200 shadow-sm text-text-main font-semibold' : 'text-text-subtle'}`}>
                                                    {lang === 'vi' ? 'Tùy chỉnh' : 'Custom'}
                                                </button>
                                            </div>
                                        </div>

                                        {isCustomMode && (
                                            <div className="flex items-center gap-2 animate-fade-in">
                                                <input type="number" value={totalCustomCount || ''} onChange={(e) => handleCountChange(type, e.target.value)} className="w-full bg-base-300 p-2 rounded-md text-center font-semibold border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none" min="1" placeholder={lang === 'vi' ? 'Tổng số' : 'Total'}/>
                                                <span className="text-sm text-text-subtle">{lang === 'vi' ? 'câu hỏi' : 'questions'}</span>
                                            </div>
                                        )}
                                        
                                        <div className="space-y-3">
                                            <h4 className="text-sm font-semibold text-text-subtle">{lang === 'vi' ? 'Định dạng mức độ' : 'Difficulty Levels'}</h4>
                                            {difficultyOptions.map(({ level, vi: vi_level, en: en_level }) => {
                                                const isLevelSelected = selectedDifficultyLevels.has(level);
                                                const isLevelCustom = difficultyCountModes[type]?.[level] === 'custom';
                                                return (
                                                    <div key={level} className={`p-2 rounded-lg transition-all ${isLevelSelected ? 'bg-base-300/50' : ''}`}>
                                                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleDifficultyLevelToggle(type, level)}>
                                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isLevelSelected ? 'bg-brand-secondary border-brand-secondary' : 'bg-base-100 border-border-color'}`}>
                                                                {isLevelSelected && <CheckIcon className="w-3 h-3 text-white"/>}
                                                            </div>
                                                            <span className="text-sm font-medium">{lang === 'vi' ? vi_level : en_level}</span>
                                                        </div>

                                                        {isLevelSelected && (totalCustomCount > 0 || !isCustomMode) && (
                                                             <div className="pl-7 pt-2 mt-2 border-t border-border-color/50 animate-fade-in space-y-2">
                                                                <div className="flex items-center gap-1 bg-base-100 p-1 rounded-md w-fit">
                                                                    <button onClick={() => handleDifficultyModeChange(type, level, 'auto')} className={`px-2 py-0.5 text-xs rounded ${!isLevelCustom ? 'bg-base-300 shadow-sm text-text-main font-semibold' : 'text-text-subtle'}`}>
                                                                        {lang === 'vi' ? 'Tự động' : 'Auto'}
                                                                    </button>
                                                                    <button onClick={() => handleDifficultyModeChange(type, level, 'custom')} disabled={!isCustomMode} className={`px-2 py-0.5 text-xs rounded ${isLevelCustom ? 'bg-base-300 shadow-sm text-text-main font-semibold' : 'text-text-subtle'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                                                        {lang === 'vi' ? 'Tùy chỉnh' : 'Custom'}
                                                                    </button>
                                                                </div>
                                                                {isLevelCustom && (
                                                                    <div className="flex items-center gap-2">
                                                                        <input type="number" value={difficultyCounts[type]?.[level] || ''} onChange={(e) => handleDifficultyCountChange(type, level, e.target.value)} className="w-full bg-base-100 p-2 rounded-md text-center font-semibold border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none" min="0" placeholder="0" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {(() => { // IIFE to calculate and render warning
                                                const customDifficultyTotal = Array.from(selectedDifficultyLevels).reduce((acc, level) => {
                                                    if (difficultyCountModes[type]?.[level] === 'custom') {
                                                        return acc + (difficultyCounts[type]?.[level] || 0);
                                                    }
                                                    return acc;
                                                }, 0);

                                                const isOverMax = isCustomMode && totalCustomCount > 0 && customDifficultyTotal > totalCustomCount;

                                                if (isOverMax) {
                                                    return (
                                                        <p className="text-xs text-yellow-400 mt-2 text-center animate-fade-in flex items-center justify-center gap-1">
                                                            <ExclamationTriangleIcon className="w-4 h-4 inline-block" />
                                                            {lang === 'vi' 
                                                                ? `Vui lòng nhập lại số lượng mức độ hợp lý, tối đa là ${totalCustomCount}` 
                                                                : `Please re-enter valid difficulty counts, the maximum is ${totalCustomCount}`}
                                                        </p>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold text-text-main flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-brand-secondary"/>
                        {lang === 'vi' ? '3. Chọn Model AI' : '3. Choose AI Model'}
                    </h3>
                    <div className="space-y-2">
                        <ModelOption model="gemini-2.5-pro" label="Gemini 2.5 Pro" description={lang === 'vi' ? 'Mô hình mạnh mẽ nhất, hỗ trợ các tác vụ phức tạp.' : 'Most powerful model, supports complex tasks.'} selectedModel={selectedModel} onSelect={setSelectedModel} />
                        <ModelOption model="gemini-2.5-flash" label="Gemini 2.5 Flash" description={lang === 'vi' ? 'Mô hình cân bằng, hiệu quả cho hầu hết tác vụ.' : 'A balanced model, efficient for most tasks.'} selectedModel={selectedModel} onSelect={setSelectedModel} />
                        <ModelOption model="gemini-flash-latest" label="Gemini Flash Latest" description={lang === 'vi' ? 'Mô hình tối ưu về tốc độ, cho phản hồi nhanh chóng.' : 'Model optimized for speed, for quick responses.'} selectedModel={selectedModel} onSelect={setSelectedModel} />
                        <ModelOption model="gemini-flash-lite-latest" label="Gemini Flash Lite Latest" description={lang === 'vi' ? 'Mô hình nhẹ, nhanh nhất cho các tác vụ đơn giản.' : 'Lightweight model, fastest for simple tasks.'} selectedModel={selectedModel} onSelect={setSelectedModel} />
                    </div>
                </div>
                
                <div className="space-y-3">
                    <h3 className="font-semibold text-text-main">{lang === 'vi' ? '4. Tùy chọn' : '4. Options'}</h3>
                    <ToggleSwitch label={lang === 'vi' ? 'Tự động tạo lời giải thích' : 'Auto-generate explanations'} enabled={shouldGenerateExplanations} onChange={setShouldGenerateExplanations} />
                    <ToggleSwitch label={lang === 'vi' ? 'Sử dụng Tìm kiếm trên Web' : 'Use Web Search'} description={lang === 'vi' ? 'AI sẽ tìm kiếm trên web để có câu trả lời/giải thích cập nhật.' : 'AI will search the web for up-to-date answers/explanations.'} enabled={useWebSearch} onChange={setUseWebSearch} />
                </div>

                {shouldGenerateExplanations && (
                    <div className="space-y-3 p-4 bg-base-100 rounded-lg animate-fade-in border border-border-color">
                        <label htmlFor="knowledge-base-select" className="block font-medium text-text-main">
                            {lang === 'vi' ? 'Sử dụng kiến thức từ' : 'Use knowledge from'}
                        </label>
                        <select id="knowledge-base-select" value={selectedKnowledgeBaseId} onChange={(e) => setSelectedKnowledgeBaseId(e.target.value)} className="w-full bg-base-300 p-3 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none">
                            <option value="__general__">{lang === 'vi' ? 'Kiến thức chung của AI' : 'General AI Knowledge'}</option>
                            <option value="__all__">{lang === 'vi' ? 'Tất cả chuyên môn' : 'All Specialties'}</option>
                            {knowledgeBases.map(kb => (
                                <option key={kb.id} value={kb.id}>{kb.name}</option>
                            ))}
                        </select>
                        
                        {entriesForKb.length > 0 && (
                            <div className="space-y-2 pt-2 animate-fade-in">
                                <h4 className="font-medium text-text-main text-sm">{lang === 'vi' ? 'Chọn bài học cụ thể' : 'Select specific entries'}</h4>
                                <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-base-300 rounded-md border border-border-color">
                                    <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-300-hover rounded-md">
                                        <input type="checkbox" checked={entriesForKb.length > 0 && selectedEntryIds.size === entriesForKb.length} onChange={handleToggleSelectAllEntries} className="h-4 w-4 rounded form-checkbox bg-base-100 border-border-color" />
                                        <span className="font-semibold text-text-main text-sm">{lang === 'vi' ? 'Chọn tất cả' : 'Select All'}</span>
                                    </label>
                                    {entriesForKb.map(entry => (
                                        <label key={entry.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-300-hover rounded-md">
                                            <input type="checkbox" checked={selectedEntryIds.has(entry.id)} onChange={() => handleToggleEntry(entry.id)} className="h-4 w-4 rounded form-checkbox bg-base-100 border-border-color" />
                                            <span className="text-text-subtle text-sm">{entry.title}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedKnowledgeBaseId !== '__general__' && (
                            <div className="pt-2">
                                <label htmlFor="integrate-ai-knowledge" className="flex items-center gap-3 cursor-pointer p-2">
                                    <input id="integrate-ai-knowledge" type="checkbox" checked={integrateGeneralAI} onChange={(e) => setIntegrateGeneralAI(e.target.checked)} className="h-5 w-5 rounded form-checkbox bg-base-300 border-border-color" />
                                    <span className="text-text-main text-sm">{lang === 'vi' ? 'Tích hợp thêm kiến thức chung của AI' : 'Also integrate general AI knowledge'}</span>
                                </label>
                            </div>
                        )}
                    </div>
                )}

                {localError && (
                    <div role="alert" className="p-3 bg-error-bg text-error-text border border-error-border rounded-md text-sm animate-fade-in">
                        <strong>{lang === 'vi' ? 'Lỗi:' : 'Error:'}</strong> {localError}
                    </div>
                )}
                
                <div className="pt-4 border-t border-border-color">
                    <div className="flex flex-col sm:flex-row-reverse gap-4">
                        <div className="relative w-full sm:w-auto">
                            <button onClick={handleConfirm} disabled={isConfirmDisabled} className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-6 rounded-lg transition-colors text-text-inverted disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg btn-shine flex items-center justify-center gap-2">
                                <SparklesIcon className="w-5 h-5"/>
                                {lang === 'vi' ? 'Bắt đầu tạo' : 'Start Generation'}
                            </button>
                            {isConfirmDisabled && <div className="absolute inset-0 cursor-not-allowed" onClick={triggerDisabledWarning} title={lang === 'vi' ? 'Vui lòng hoàn thành các trường bắt buộc' : 'Please complete the required fields'}></div>}
                        </div>

                        <button onClick={onCancel} className="w-full sm:w-auto bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors border border-border-color hover:border-border-hover">
                            {lang === 'vi' ? 'Hủy' : 'Cancel'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default QuizTypeSelectionView;