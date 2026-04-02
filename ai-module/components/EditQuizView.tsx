import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GeneratedQuiz, QuizQuestion, Language, SubQuestion, KnowledgeBase, KnowledgeEntry, GeminiModel } from '../types';
import { BackIcon, TrashIcon, PlusIcon, CloseIcon, ListBulletIcon, CheckBadgeIcon, PencilSquareIcon, SparklesIcon, SpinnerIcon, ChevronDownIcon, ImageIcon, WrenchScrewdriverIcon, UploadIcon, CheckCircleIcon, FileTypeIcon, MoveIcon, CheckIcon, MusicalNoteIcon } from './icons';
import { useOutsideAlerter } from '../hooks/useOutsideAlerter';
import { generateAnswerAndExplanation, generateShortAnswer, generateMultiTrueFalseAnswers, fixQuizQuestion, generateAdditionalQuestions } from '../services/geminiService';
import { Part } from '@google/genai';
import { extractFileParts } from '../services/fileExtractor';


interface EditQuizViewProps {
  initialQuiz: GeneratedQuiz;
  onSave: (quiz: GeneratedQuiz) => void;
  onCancel: () => void;
  lang: Language;
  knowledgeBases: KnowledgeBase[];
  knowledgeEntries: KnowledgeEntry[];
  setZoomedImageUrl: (url: string | null) => void;
}

interface ConfirmationModalState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

const ToggleSwitch: React.FC<{
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ label, description, enabled, onChange }) => (
  <label htmlFor={label} className="flex items-center justify-between cursor-pointer bg-base-100 p-3 rounded-lg">
    <div>
        <span className="font-semibold text-text-main text-sm">{label}</span>
        {description && <p className="text-xs text-text-subtle">{description}</p>}
    </div>
    <div className="relative flex-shrink-0">
      <input 
        id={label}
        type="checkbox" 
        className="sr-only" 
        checked={enabled} 
        onChange={(e) => onChange(e.target.checked)} 
      />
      <div className={`block w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-brand-primary' : 'bg-base-300'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${enabled ? 'transform translate-x-5' : ''}`}></div>
    </div>
  </label>
);


const EditQuizView: React.FC<EditQuizViewProps> = ({ initialQuiz, onSave, onCancel, lang, knowledgeBases, knowledgeEntries, setZoomedImageUrl }) => {
    const [quiz, setQuiz] = useState<GeneratedQuiz>(initialQuiz);
    const [confirmModal, setConfirmModal] = useState<ConfirmationModalState | null>(null);
    const [isAddQuestionMenuOpen, setIsAddQuestionMenuOpen] = useState(false);
    const [aiGeneratingForQuestion, setAiGeneratingForQuestion] = useState<number | null>(null);
    const [aiFixingForQuestion, setAiFixingForQuestion] = useState<number | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedQuestionIndices, setSelectedQuestionIndices] = useState<Set<number>>(new Set());
    const [moveModalState, setMoveModalState] = useState<{ isOpen: boolean; fromIndex: number | null; error: string | null }>({ isOpen: false, fromIndex: null, error: null });
    const [targetPositionInput, setTargetPositionInput] = useState('');

    const [isAiAddModalOpen, setIsAiAddModalOpen] = useState(false);
    const [aiAddPrompt, setAiAddPrompt] = useState('');
    const [isAiAddingQuestions, setIsAiAddingQuestions] = useState(false);

    const [assistantMenuForQuestion, setAssistantMenuForQuestion] = useState<number | null>(null);
    const assistantMenuRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(assistantMenuRef, () => setAssistantMenuForQuestion(null), 'ai-assistant-trigger');

    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const [activeQuestionIndexForUpload, setActiveQuestionIndexForUpload] = useState<number | null>(null);
    const [uploadTypeForQuestion, setUploadTypeForQuestion] = useState<'image' | 'audio' | null>(null);
    
    // Reference document state for multi-file
    const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
    const [referenceFileParts, setReferenceFileParts] = useState<Part[] | null>(null);
    const [isParsingFile, setIsParsingFile] = useState(false);
    const [fixRequest, setFixRequest] = useState<{ qIndex: number; isVisible: boolean; prompt: string }>({ qIndex: -1, isVisible: false, prompt: '' });
    const [referencePreviews, setReferencePreviews] = useState<string[]>([]);

    // AI Suggestion settings state
    const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string>('__general__');
    const [integrateGeneralAI, setIntegrateGeneralAI] = useState(true);
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
    const [useWebSearch, setUseWebSearch] = useState(false);

    // Search and Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<QuizQuestion['type']>>(new Set());

    const addQuestionMenuRef = useRef<HTMLDivElement>(null);
    useOutsideAlerter(addQuestionMenuRef, () => setIsAddQuestionMenuOpen(false));

    useEffect(() => {
        const urls = referenceFiles.map(file => {
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
        setReferencePreviews(urls);

        return () => {
            urls.forEach(url => {
                if (url) URL.revokeObjectURL(url);
            });
        };
    }, [referenceFiles]);

    const handleFocus = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.target.select();

    const entriesForKb = useMemo(() => {
        if (selectedKnowledgeBaseId === '__general__' || selectedKnowledgeBaseId === '__all__') {
            return [];
        }
        return knowledgeEntries.filter(e => e.knowledgeBaseId === selectedKnowledgeBaseId);
    }, [selectedKnowledgeBaseId, knowledgeEntries]);

    useEffect(() => {
        // Reset entry selections when the knowledge base changes
        setSelectedEntryIds(new Set());
    }, [selectedKnowledgeBaseId]);

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

    const getGroundingParams = () => {
        let groundingContent: string | undefined = undefined;
        let finalEntryIds: string[] = [];

        if (selectedKnowledgeBaseId === '__all__') {
            finalEntryIds = knowledgeEntries.map(e => e.id);
        } else if (selectedKnowledgeBaseId !== '__general__') {
            finalEntryIds = Array.from(selectedEntryIds);
        }

        if (finalEntryIds.length > 0) {
            const relevantEntries = knowledgeEntries.filter(e => finalEntryIds.includes(e.id));
            groundingContent = relevantEntries.map(e => {
                const textContent = (e.contentBlocks || [])
                    .filter(block => block.type === 'text')
                    .map(block => (block as { type: 'text', content: string }).content)
                    .join('\n');
                return `Title: ${e.title}\n\n${textContent}`;
            }).join('\n\n---\n\n');
        }
        
        const shouldIntegrate = selectedKnowledgeBaseId === '__general__' || integrateGeneralAI;
        return { groundingContent, integrateGeneralAI: shouldIntegrate };
    };

    const handleReferenceFilesSelect = async (newFiles: File[]) => {
        const updatedFiles = [...referenceFiles, ...newFiles];
        setReferenceFiles(updatedFiles);

        setIsParsingFile(true);
        setReferenceFileParts(null);
        try {
            const filePartsPromises = updatedFiles.map(file => extractFileParts(file));
            const nestedParts = await Promise.all(filePartsPromises);
            const allParts = nestedParts.flat();
            setReferenceFileParts(allParts);
        } catch (error) {
            alert((error as Error).message);
        } finally {
            setIsParsingFile(false);
        }
    };

    const handleRemoveReferenceFile = async (indexToRemove: number) => {
        const updatedFiles = referenceFiles.filter((_, index) => index !== indexToRemove);
        setReferenceFiles(updatedFiles);

        if (updatedFiles.length === 0) {
            setReferenceFileParts(null);
            return;
        }

        setIsParsingFile(true);
        try {
            const filePartsPromises = updatedFiles.map(file => extractFileParts(file));
            const nestedParts = await Promise.all(filePartsPromises);
            const allParts = nestedParts.flat();
            setReferenceFileParts(allParts);
        } catch (error) {
             alert((error as Error).message);
        } finally {
            setIsParsingFile(false);
        }
    };

    const handleQuizChange = (field: keyof GeneratedQuiz, value: any) => {
        setQuiz(prev => ({...prev, [field]: value}));
    }

    const handleQuestionChange = (qIndex: number, field: keyof QuizQuestion, value: any) => {
        setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const updatedQuestion = { ...newQuestions[qIndex], [field]: value };
            if (value === undefined) {
                delete (updatedQuestion as any)[field];
            }
            newQuestions[qIndex] = updatedQuestion;
            return { ...prev, questions: newQuestions };
        });
    };

    const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
        setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const oldOption = newQuestions[qIndex].options?.[oIndex];
            const newOptions = [...(newQuestions[qIndex].options || [])];
            newOptions[oIndex] = value;
            
            if (newQuestions[qIndex].answer === oldOption) {
                newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions, answer: value };
            } else {
                newQuestions[qIndex] = { ...newQuestions[qIndex], options: newOptions };
            }
            return { ...prev, questions: newQuestions };
        });
    };

    const handleAddOption = (qIndex: number) => {
        setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const question = newQuestions[qIndex];
            const newOptions = [...(question.options || []), `New Option ${ (question.options?.length || 0) + 1}`];
            newQuestions[qIndex] = {...question, options: newOptions};
            return {...prev, questions: newQuestions};
        });
    }

    const handleDeleteOption = (qIndex: number, oIndex: number) => {
        const question = quiz.questions[qIndex];
        if (!question.options || question.options.length <= 2) return;

        setConfirmModal({
            isOpen: true,
            title: lang === 'vi' ? 'Xóa Lựa chọn' : 'Delete Option',
            message: lang === 'vi' ? 'Bạn có chắc chắn muốn xóa lựa chọn này không?' : 'Are you sure you want to delete this option?',
            onConfirm: () => {
                setQuiz(prev => {
                    const newQuestions = [...prev.questions];
                    const questionToUpdate = { ...newQuestions[qIndex] };
                    const optionToDelete = questionToUpdate.options?.[oIndex];
                    const newOptions = (questionToUpdate.options || []).filter((_, i) => i !== oIndex);
                    questionToUpdate.options = newOptions;

                    if (questionToUpdate.answer === optionToDelete && newOptions.length > 0) {
                        questionToUpdate.answer = newOptions[0];
                    }
                    newQuestions[qIndex] = questionToUpdate;
                    return { ...prev, questions: newQuestions };
                });
                setConfirmModal(null);
            }
        });
    };

    const handleAddQuestion = (type: QuizQuestion['type']) => {
        let newQuestion: QuizQuestion;
        switch(type) {
            case 'multi-true-false':
                newQuestion = {
                    question: lang === 'vi' ? 'Phân tích các nhận định sau' : 'Analyze the following statements',
                    type: 'multi-true-false',
                    subQuestions: [{ statement: lang === 'vi' ? 'Nhận định 1' : 'Statement 1', answer: 'True' }],
                    explanation: lang === 'vi' ? 'Giải thích cho câu hỏi mới.' : 'Explanation for the new question.',
                };
                break;
            case 'short-answer':
                 newQuestion = {
                    question: lang === 'vi' ? 'Điền vào chỗ trống...' : 'Fill in the blank...',
                    type: 'short-answer',
                    answer: lang === 'vi' ? 'Câu trả lời đúng' : 'Correct Answer',
                    explanation: lang === 'vi' ? 'Giải thích cho câu hỏi mới.' : 'Explanation for the new question.',
                };
                break;
            case 'multiple-choice':
            default:
                 newQuestion = {
                    question: lang === 'vi' ? 'Câu hỏi mới' : 'New Question',
                    type: 'multiple-choice',
                    options: ['Option 1', 'Option 2'],
                    answer: 'Option 1',
                    explanation: lang === 'vi' ? 'Giải thích cho câu hỏi mới.' : 'Explanation for the new question.',
                };
                break;
        }
       
        setQuiz(prev => ({
            ...prev,
            questions: [...prev.questions, newQuestion]
        }));
        setIsAddQuestionMenuOpen(false);
    };
    
    const handleDeleteQuestion = (qIndex: number) => {
        setConfirmModal({
            isOpen: true,
            title: lang === 'vi' ? 'Xóa Câu hỏi' : 'Delete Question',
            message: lang === 'vi' ? 'Bạn có chắc chắn muốn xóa câu hỏi này không?' : 'Are you sure you want to delete this question?',
            onConfirm: () => {
                setQuiz(prev => ({
                    ...prev,
                    questions: prev.questions.filter((_, index) => index !== qIndex)
                }));
                setConfirmModal(null);
            }
        });
    };

    const handleSubQuestionChange = (qIndex: number, sIndex: number, field: keyof SubQuestion, value: string) => {
         setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const subQuestions = [...(newQuestions[qIndex].subQuestions || [])];
            subQuestions[sIndex] = { ...subQuestions[sIndex], [field]: value };
            newQuestions[qIndex] = { ...newQuestions[qIndex], subQuestions };
            return { ...prev, questions: newQuestions };
        });
    }
    
    const handleAddSubQuestion = (qIndex: number) => {
        setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const newSubQuestion: SubQuestion = { statement: lang === 'vi' ? 'Nhận định mới' : 'New Statement', answer: 'True' };
            const subQuestions = [...(newQuestions[qIndex].subQuestions || []), newSubQuestion];
            newQuestions[qIndex] = { ...newQuestions[qIndex], subQuestions };
            return { ...prev, questions: newQuestions };
        });
    }

    const handleDeleteSubQuestion = (qIndex: number, sIndex: number) => {
         setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const subQuestions = (newQuestions[qIndex].subQuestions || []).filter((_, i) => i !== sIndex);
            newQuestions[qIndex] = { ...newQuestions[qIndex], subQuestions };
            return { ...prev, questions: newQuestions };
        });
    }
    
    const handleGenerateAnswer = async (qIndex: number) => {
        const question = quiz.questions[qIndex];
        const modelToUse = quiz.model || 'gemini-flash-latest';
        if (!question) return;

        // First, check if the question is in a valid state to be sent to the AI
        const isReadyForApiCall = (
            (question.type === 'multiple-choice' && question.options && question.options.length >= 2 && question.options.every(opt => opt.trim() !== '')) ||
            (question.type === 'short-answer' && question.question.trim() !== '') ||
            (question.type === 'multi-true-false' && question.subQuestions && question.subQuestions.length > 0 && question.subQuestions.every(sq => sq.statement.trim() !== ''))
        );
        
        // Close the menu regardless
        setAssistantMenuForQuestion(null);

        if (!isReadyForApiCall) {
            const alertMessage = lang === 'vi' 
                ? 'Vui lòng hoàn thành câu hỏi (ví dụ: thêm ít nhất 2 lựa chọn không trống cho câu trắc nghiệm, hoặc ít nhất 1 mệnh đề không trống cho câu Đúng/Sai) trước khi dùng trợ lý AI.'
                : 'Please complete the question (e.g., add at least 2 non-empty options for multiple-choice, or at least 1 non-empty statement for True/False) before using the AI assistant.';
            alert(alertMessage);
            return;
        }

        setAiGeneratingForQuestion(qIndex);
        try {
            const { groundingContent, integrateGeneralAI: shouldIntegrate } = getGroundingParams();
            if (question.type === 'multiple-choice' && question.options) {
                const { answer, explanation } = await generateAnswerAndExplanation(
                    question.question, question.options, modelToUse, lang, useWebSearch, groundingContent, shouldIntegrate
                );
                handleQuestionChange(qIndex, 'answer', answer);
                handleQuestionChange(qIndex, 'explanation', explanation);
            } else if (question.type === 'short-answer') {
                const { answer, explanation } = await generateShortAnswer(
                    question.question, modelToUse, lang, useWebSearch, groundingContent, shouldIntegrate
                );
                handleQuestionChange(qIndex, 'answer', answer);
                handleQuestionChange(qIndex, 'explanation', explanation);
            } else if (question.type === 'multi-true-false' && question.subQuestions) {
                const result = await generateMultiTrueFalseAnswers(
                    question.question, question.subQuestions.map(sq => ({ statement: sq.statement })), modelToUse, lang, useWebSearch, groundingContent, shouldIntegrate
                );
                handleQuestionChange(qIndex, 'subQuestions', result.subQuestions);
                handleQuestionChange(qIndex, 'explanation', result.explanation);
            }
        } catch (error) {
            console.error(error);
            alert((error as Error).message);
        } finally {
            setAiGeneratingForQuestion(null);
        }
    };
    
    const handleFixQuestion = async () => {
        if (fixRequest.qIndex === -1) return;
        
        const qIndex = fixRequest.qIndex;
        const originalQuestion = quiz.questions[qIndex];
        const modelToUse = quiz.model || 'gemini-flash-latest';

        setAiFixingForQuestion(qIndex);
        setFixRequest(prev => ({ ...prev, isVisible: false }));

        try {
            const fixedQuestion = await fixQuizQuestion(
                originalQuestion,
                referenceFileParts,
                fixRequest.prompt,
                modelToUse,
                lang
            );
            
            setQuiz(prev => {
                const newQuestions = [...prev.questions];
                newQuestions[qIndex] = fixedQuestion;
                return { ...prev, questions: newQuestions };
            });

        } catch (error) {
            alert((error as Error).message);
        } finally {
            setAiFixingForQuestion(null);
            setFixRequest({ qIndex: -1, isVisible: false, prompt: '' });
        }
    };

    const handleAiAddQuestions = async () => {
        if (!aiAddPrompt.trim()) {
            alert(lang === 'vi' ? 'Vui lòng nhập yêu cầu cho AI.' : 'Please enter a prompt for the AI.');
            return;
        }

        setIsAiAddingQuestions(true);
        try {
            const modelToUse = quiz.model || 'gemini-flash-latest';
            const newQuestions = await generateAdditionalQuestions({
                userPrompt: aiAddPrompt,
                documentParts: referenceFileParts,
                existingQuestions: quiz.questions,
                modelName: modelToUse,
                lang,
            });

            if (newQuestions && newQuestions.length > 0) {
                setQuiz(prev => ({
                    ...prev,
                    questions: [...prev.questions, ...newQuestions]
                }));
            }
            
            setIsAiAddModalOpen(false);
            setAiAddPrompt('');

        } catch (error) {
            alert((error as Error).message);
        } finally {
            setIsAiAddingQuestions(false);
        }
    };


    const handleUploadClick = (qIndex: number, type: 'image' | 'audio') => {
        setActiveQuestionIndexForUpload(qIndex);
        setUploadTypeForQuestion(type);
        if (type === 'image') {
            imageInputRef.current?.click();
        } else {
            audioInputRef.current?.click();
        }
    };
    
    const handleFileSelectForUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && activeQuestionIndexForUpload !== null && uploadTypeForQuestion) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                handleQuestionChange(activeQuestionIndexForUpload, uploadTypeForQuestion, base64String);
            };
            reader.readAsDataURL(file);
            e.target.value = ''; // Reset file input
        }
        setActiveQuestionIndexForUpload(null);
        setUploadTypeForQuestion(null);
    };

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            setSelectedQuestionIndices(new Set());
        }
        setIsSelectionMode(!isSelectionMode);
    };

    const handleToggleSelectItem = (qIndex: number) => {
        setSelectedQuestionIndices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(qIndex)) {
                newSet.delete(qIndex);
            } else {
                newSet.add(qIndex);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedQuestionIndices.size === quiz.questions.length) {
            setSelectedQuestionIndices(new Set());
        } else {
            const allIndices = Array.from({ length: quiz.questions.length }, (_, i) => i);
            setSelectedQuestionIndices(new Set(allIndices));
        }
    };

    const handleBulkDelete = () => {
        setConfirmModal({
            isOpen: true,
            title: lang === 'vi' ? `Xóa ${selectedQuestionIndices.size} câu hỏi` : `Delete ${selectedQuestionIndices.size} questions`,
            message: lang === 'vi' ? 'Bạn có chắc chắn muốn xóa các câu hỏi đã chọn không?' : 'Are you sure you want to delete the selected questions?',
            onConfirm: () => {
                setQuiz(prev => ({
                    ...prev,
                    questions: prev.questions.filter((_, index) => !selectedQuestionIndices.has(index))
                }));
                setConfirmModal(null);
                toggleSelectionMode(); // Exit selection mode after deleting
            }
        });
    };

    const openMoveModal = (fromIndex: number) => {
        setMoveModalState({ isOpen: true, fromIndex, error: null });
        setTargetPositionInput((fromIndex + 1).toString());
    };
    
    const closeMoveModal = () => {
        setMoveModalState({ isOpen: false, fromIndex: null, error: null });
    };
    
    const handleMoveQuestion = () => {
        const { fromIndex } = moveModalState;
        if (fromIndex === null) return;
    
        const targetPosition = parseInt(targetPositionInput, 10);
        if (isNaN(targetPosition) || targetPosition < 1 || targetPosition > quiz.questions.length) {
            setMoveModalState(prev => ({ ...prev, error: lang === 'vi' ? `Vui lòng nhập một số hợp lệ từ 1 đến ${quiz.questions.length}.` : `Please enter a valid number between 1 and ${quiz.questions.length}.` }));
            return;
        }
    
        const targetIndex = targetPosition - 1;
    
        if (fromIndex === targetIndex) {
            closeMoveModal();
            return;
        }
    
        setQuiz(prev => {
            const newQuestions = [...prev.questions];
            const [questionToMove] = newQuestions.splice(fromIndex, 1);
            newQuestions.splice(targetIndex, 0, questionToMove);
            return { ...prev, questions: newQuestions };
        });
    
        closeMoveModal();
    };

    const handleToggleFilter = (type: QuizQuestion['type']) => {
        setActiveFilters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(type)) {
                newSet.delete(type);
            } else {
                newSet.add(type);
            }
            return newSet;
        });
    };

    const filteredQuestions = useMemo(() => {
        return quiz.questions
            .map((question, index) => ({ question, originalIndex: index })) // Keep original index
            .filter(({ question }) => {
                const searchMatch = searchQuery.trim() === '' ||
                    question.question.toLowerCase().includes(searchQuery.toLowerCase());
                
                const filterMatch = activeFilters.size === 0 ||
                    activeFilters.has(question.type);
                
                return searchMatch && filterMatch;
            });
    }, [quiz.questions, searchQuery, activeFilters]);

    const renderQuestionEditor = (question: QuizQuestion, qIndex: number) => {
        const isLoading = aiGeneratingForQuestion === qIndex || aiFixingForQuestion === qIndex;
        const isSelected = selectedQuestionIndices.has(qIndex);

        return (
             <div 
                key={qIndex} 
                className={`bg-base-300 p-4 rounded-lg space-y-3 relative animate-fade-in transition-all ${isSelectionMode ? 'pr-12 cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-brand-primary' : ''}`}
                onClick={isSelectionMode ? () => handleToggleSelectItem(qIndex) : undefined}
             >
                {isSelectionMode && (
                    <div className="absolute top-4 left-4 z-10 pointer-events-none">
                        <div 
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-brand-primary border-brand-secondary' : 'bg-base-100 border-border-color'}`}
                        >
                            {isSelected && <CheckIcon className="w-4 h-4 text-white"/>}
                        </div>
                    </div>
                )}
                
                <div className={`absolute top-2 right-2 flex items-center gap-1 z-10 ${isSelectionMode ? 'hidden' : ''}`}>
                    <button
                        onClick={(e) => { e.stopPropagation(); openMoveModal(qIndex); }}
                        className="p-1.5 text-slate-500 hover:bg-base-100 hover:text-text-main rounded-full transition-colors"
                        title={lang === 'vi' ? 'Di chuyển câu hỏi' : 'Move question'}
                    >
                        <MoveIcon className="w-5 h-5"/>
                    </button>
                    <div className="relative">
                       <button
                            onClick={(e) => { e.stopPropagation(); setAssistantMenuForQuestion(assistantMenuForQuestion === qIndex ? null : qIndex); }}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary/40 transition-colors disabled:opacity-50 disabled:cursor-wait ai-assistant-trigger"
                            title={lang === 'vi' ? 'Trợ lý AI' : 'AI Assistant'}
                        >
                            {isLoading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                        </button>
                        {assistantMenuForQuestion === qIndex && (
                            <div ref={assistantMenuRef} className="absolute right-0 top-full mt-1 w-60 bg-base-100 rounded-md shadow-lg z-20 border border-border-color py-1 animate-fade-in">
                                <button onClick={(e) => {e.stopPropagation(); handleGenerateAnswer(qIndex)}} className="w-full text-left px-3 py-2 text-sm hover:bg-base-300 flex items-center gap-3">
                                    <SparklesIcon className="w-5 h-5 text-text-subtle" />
                                    <span>{lang === 'vi' ? 'Gợi ý đáp án & giải thích' : 'Suggest Answer & Explanation'}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setFixRequest({ qIndex, isVisible: true, prompt: '' }); setAssistantMenuForQuestion(null); }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-base-300 flex items-center gap-3"
                                >
                                    <WrenchScrewdriverIcon className="w-5 h-5 text-text-subtle" />
                                    <span>{lang === 'vi' ? 'Sửa với AI' : 'Fix with AI'}</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={(e) => {e.stopPropagation(); handleDeleteQuestion(qIndex)}}
                        className="p-1.5 text-slate-500 hover:bg-red-900/50 hover:text-red-400 rounded-full transition-colors"
                        aria-label={lang === 'vi' ? 'Xóa câu hỏi' : 'Delete question'}
                    >
                        <TrashIcon className="w-5 h-5"/>
                    </button>
                </div>
                
                <div className={`${isSelectionMode ? 'ml-10' : ''}`}>
                    <label className="block text-sm font-medium text-text-subtle">{lang === 'vi' ? `Câu hỏi ${qIndex + 1}` : `Question ${qIndex + 1}`}</label>
                    <textarea 
                        value={question.question}
                        onChange={(e) => handleQuestionChange(qIndex, 'question', e.target.value)}
                        className="w-full bg-base-100 p-2 rounded-md text-text-main resize-y"
                        rows={2}
                        onClick={e => isSelectionMode && e.stopPropagation()}
                        onFocus={handleFocus}
                    />

                    {question.passage !== undefined ? (
                        <div className="mt-2 bg-base-100 p-2 rounded-md">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-sm font-medium text-text-subtle">{lang === 'vi' ? 'Đoạn văn' : 'Passage'}</label>
                                <button 
                                    onClick={(e) => {e.stopPropagation(); handleQuestionChange(qIndex, 'passage', undefined)}}
                                    className="p-1.5 text-slate-500 hover:bg-red-900/50 hover:text-red-400 rounded-full transition-colors"
                                    aria-label={lang === 'vi' ? 'Xóa đoạn văn' : 'Delete passage'}
                                >
                                    <TrashIcon className="w-4 h-4"/>
                                </button>
                            </div>
                            <textarea 
                                value={question.passage}
                                onChange={(e) => handleQuestionChange(qIndex, 'passage', e.target.value)}
                                className="w-full bg-base-300 p-2 rounded-md text-text-main resize-y text-sm"
                                rows={5}
                                placeholder={lang === 'vi' ? 'Nhập đoạn văn liên quan đến câu hỏi...' : 'Enter the passage related to the question...'}
                                onClick={e => isSelectionMode && e.stopPropagation()}
                                onFocus={handleFocus}
                            />
                        </div>
                    ) : (
                        <button onClick={(e) => {e.stopPropagation(); handleQuestionChange(qIndex, 'passage', '')}} className="mt-2 flex items-center gap-2 text-sm text-brand-secondary hover:underline">
                            <PlusIcon className="w-4 h-4" />
                            {lang === 'vi' ? 'Thêm đoạn văn' : 'Add Passage'}
                        </button>
                    )}


                    {question.image && (
                        <div className="mt-2 relative w-fit">
                            <img src={question.image} alt={lang === 'vi' ? 'Ảnh câu hỏi' : 'Question image'} className="max-h-40 rounded-md border border-border-color cursor-pointer" onClick={(e) => {e.stopPropagation(); setZoomedImageUrl(question.image!);}} />
                            <button
                                onClick={(e) => {e.stopPropagation(); handleQuestionChange(qIndex, 'image', undefined)}}
                                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                                aria-label={lang === 'vi' ? 'Xóa ảnh' : 'Remove image'}
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {question.audio && (
                        <div className="mt-2 relative w-full max-w-sm">
                           <audio controls src={question.audio} className="w-full h-10" />
                            <button
                                onClick={(e) => {e.stopPropagation(); handleQuestionChange(qIndex, 'audio', undefined)}}
                                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                                aria-label={lang === 'vi' ? 'Xóa âm thanh' : 'Remove audio'}
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    <div className="mt-2 flex items-center gap-4">
                        {!question.image && (
                            <button onClick={(e) => {e.stopPropagation(); handleUploadClick(qIndex, 'image')}} className="flex items-center gap-2 text-sm text-brand-secondary hover:underline">
                                <ImageIcon className="w-4 h-4" />
                                {lang === 'vi' ? 'Thêm ảnh' : 'Add Image'}
                            </button>
                        )}
                        {!question.audio && (
                            <button onClick={(e) => {e.stopPropagation(); handleUploadClick(qIndex, 'audio')}} className="flex items-center gap-2 text-sm text-brand-secondary hover:underline">
                                <MusicalNoteIcon className="w-4 h-4" />
                                {lang === 'vi' ? 'Thêm âm thanh' : 'Add Audio'}
                            </button>
                        )}
                    </div>

                    {question.type === 'multiple-choice' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-text-subtle">{lang === 'vi' ? 'Các lựa chọn' : 'Options'}</label>
                            </div>
                            {question.options?.map((option, oIndex) => (
                                <div key={oIndex} className="flex items-center gap-2">
                                    <input 
                                        type="radio"
                                        name={`answer-${qIndex}`}
                                        checked={question.answer === option}
                                        onChange={() => handleQuestionChange(qIndex, 'answer', option)}
                                        className="form-radio h-5 w-5 text-brand-primary bg-base-100 border-border-color focus:ring-brand-secondary flex-shrink-0"
                                        onClick={e => isSelectionMode && e.stopPropagation()}
                                    />
                                    <input 
                                        type="text"
                                        value={option}
                                        onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                                        className="flex-grow bg-base-100 p-2 rounded-md text-sm"
                                        onClick={e => isSelectionMode && e.stopPropagation()}
                                        onFocus={handleFocus}
                                    />
                                    <button 
                                        onClick={(e) => {e.stopPropagation(); handleDeleteOption(qIndex, oIndex)}}
                                        disabled={(question.options?.length ?? 0) <= 2}
                                        className="p-1.5 text-slate-500 hover:bg-red-900/50 hover:text-red-400 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        aria-label={lang === 'vi' ? 'Xóa lựa chọn' : 'Delete option'}
                                    >
                                        <CloseIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button onClick={(e) => {e.stopPropagation(); handleAddOption(qIndex)}} className="text-sm flex items-center gap-1 text-brand-secondary hover:underline pt-1">
                                <PlusIcon className="w-4 h-4"/>
                                {lang === 'vi' ? 'Thêm lựa chọn' : 'Add Option'}
                            </button>
                        </div>
                    )}
                    
                    {question.type === 'multi-true-false' && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-text-subtle">{lang === 'vi' ? 'Các mệnh đề' : 'Statements'}</label>
                            </div>
                            {question.subQuestions?.map((sub, sIndex) => (
                                <div key={sIndex} className="flex items-start gap-2 bg-base-100 p-2 rounded-md" onClick={e => isSelectionMode && e.stopPropagation()}>
                                    <div className="flex-grow space-y-2">
                                        <textarea
                                            value={sub.statement}
                                            onChange={(e) => handleSubQuestionChange(qIndex, sIndex, 'statement', e.target.value)}
                                            className="w-full bg-base-300 p-2 rounded-md text-sm resize-y"
                                            placeholder={lang === 'vi' ? 'Nhập mệnh đề...' : 'Enter statement...'}
                                            rows={2}
                                            onFocus={handleFocus}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleSubQuestionChange(qIndex, sIndex, 'answer', 'True')} className={`px-3 py-1 text-sm rounded-md ${sub.answer === 'True' ? 'bg-green-600 text-white' : 'bg-base-300 hover:bg-base-300-hover'}`}>{lang === 'vi' ? 'Đúng' : 'True'}</button>
                                            <button onClick={() => handleSubQuestionChange(qIndex, sIndex, 'answer', 'False')} className={`px-3 py-1 text-sm rounded-md ${sub.answer === 'False' ? 'bg-red-600 text-white' : 'bg-base-300 hover:bg-base-300-hover'}`}>{lang === 'vi' ? 'Sai' : 'False'}</button>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteSubQuestion(qIndex, sIndex)} className="p-1.5 text-slate-500 hover:bg-red-900/50 hover:text-red-400 rounded-full transition-colors flex-shrink-0">
                                        <CloseIcon className="w-4 h-4"/>
                                    </button>
                                </div>
                            ))}
                            <button onClick={(e) => {e.stopPropagation(); handleAddSubQuestion(qIndex)}} className="text-sm flex items-center gap-1 text-brand-secondary hover:underline pt-1">
                                <PlusIcon className="w-4 h-4"/>
                                {lang === 'vi' ? 'Thêm mệnh đề' : 'Add Statement'}
                            </button>
                        </div>
                    )}
                    
                    {question.type === 'short-answer' && (
                        <div onClick={e => isSelectionMode && e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium text-text-subtle">{lang === 'vi' ? 'Câu trả lời đúng' : 'Correct Answer'}</label>
                            </div>
                            <input
                                type="text"
                                value={question.answer || ''}
                                onChange={(e) => handleQuestionChange(qIndex, 'answer', e.target.value)}
                                className="w-full bg-base-100 p-2 rounded-md"
                                placeholder={lang === 'vi' ? 'Nhập câu trả lời chính xác...' : 'Enter the exact answer...'}
                                onFocus={handleFocus}
                            />
                        </div>
                    )}

                    <div onClick={e => isSelectionMode && e.stopPropagation()}>
                        <label className="block text-sm font-medium text-text-subtle pt-2">{lang === 'vi' ? 'Giải thích' : 'Explanation'}</label>
                        <textarea 
                            value={question.explanation}
                            onChange={(e) => handleQuestionChange(qIndex, 'explanation', e.target.value)}
                            className="w-full bg-base-100 p-2 rounded-md text-text-main resize-y"
                            rows={3}
                            onFocus={handleFocus}
                        />
                    </div>
                </div>
             </div>
        )
    }

    const SelectionActionBar = () => {
        if (!isSelectionMode) return null;
        
        return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-lg z-30 px-4">
                <div className="bg-base-200/80 backdrop-blur-md p-3 rounded-xl shadow-lg flex items-center justify-between gap-4 border border-border-color animate-slide-in">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleSelectAll}
                            className="px-3 py-1.5 text-sm font-semibold bg-base-300 hover:bg-base-300-hover rounded-md transition-colors"
                        >
                            {selectedQuestionIndices.size === quiz.questions.length && quiz.questions.length > 0 ? (lang === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All') : (lang === 'vi' ? 'Chọn tất cả' : 'Select All')}
                        </button>
                        <span className="text-sm font-semibold text-text-main">{selectedQuestionIndices.size} {lang === 'vi' ? 'đã chọn' : 'selected'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleBulkDelete} disabled={selectedQuestionIndices.size === 0} className="p-2 text-sm text-red-400 hover:bg-red-900/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" aria-label={lang === 'vi' ? 'Xóa' : 'Delete'}>
                            <TrashIcon className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const ConfirmationModal: React.FC<{state: ConfirmationModalState | null; onClose: () => void; lang: Language}> = ({ state, onClose, lang }) => {
        if (!state || !state.isOpen) return null;
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
                <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in">
                    <h3 className="text-xl font-bold mb-4">{state.title}</h3>
                    <p className="text-text-subtle mb-6">{state.message}</p>
                    <div className="flex justify-end gap-4 mt-6">
                        <button onClick={onClose} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                            {lang === 'vi' ? 'Hủy' : 'Cancel'}
                        </button>
                        <button onClick={state.onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors font-semibold">
                            {lang === 'vi' ? 'Xóa' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const filterTypes: { type: QuizQuestion['type']; label: string; label_vi: string }[] = [
        { type: 'multiple-choice', label: 'Multiple Choice', label_vi: 'Trắc nghiệm' },
        { type: 'multi-true-false', label: 'True/False', label_vi: 'Đúng/Sai' },
        { type: 'short-answer', label: 'Short Answer', label_vi: 'Trả lời ngắn' },
    ];

    return (
        <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg relative max-w-4xl w-full mx-auto space-y-6">
            <input
                type="file"
                ref={imageInputRef}
                onChange={handleFileSelectForUpload}
                hidden
                accept="image/*"
            />
            <input
                type="file"
                ref={audioInputRef}
                onChange={handleFileSelectForUpload}
                hidden
                accept="audio/*"
            />
            <input
                type="file"
                id="ref-file-upload-multi"
                className="hidden"
                accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*,audio/*"
                onChange={(e) => e.target.files && handleReferenceFilesSelect(Array.from(e.target.files))}
                multiple
            />
            <div className="flex justify-between items-center">
                <button onClick={onCancel} className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Hủy' : 'Cancel'}>
                    <BackIcon className="w-6 h-6"/>
                    <span className="text-sm font-semibold hidden sm:inline">{lang === 'vi' ? 'Hủy' : 'Cancel'}</span>
                </button>
                <h2 className="text-2xl font-bold">{lang === 'vi' ? 'Chỉnh sửa Quiz' : 'Edit Quiz'}</h2>
                <div className="w-24 text-right"></div>
            </div>

            <div>
                <label htmlFor="quizTitle" className="block text-sm font-medium text-text-subtle mb-1">{lang === 'vi' ? 'Tiêu đề Quiz' : 'Quiz Title'}</label>
                <input 
                    id="quizTitle"
                    type="text"
                    value={quiz.title}
                    onChange={(e) => handleQuizChange('title', e.target.value)}
                    className="w-full bg-base-100 p-3 rounded-md text-text-main"
                    onFocus={handleFocus}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-text-subtle mb-2">{lang === 'vi' ? 'Tài liệu tham khảo (Tùy chọn)' : 'Reference Documents (Optional)'}</label>
                {referenceFiles.length > 0 ? (
                    <div className="bg-base-100 p-3 rounded-lg space-y-2 border border-border-color">
                        {isParsingFile && (
                            <div className="flex items-center gap-2 text-sm text-brand-secondary p-2">
                                <SpinnerIcon className="w-4 h-4 animate-spin" />
                                <span>{lang === 'vi' ? 'Đang phân tích tệp...' : 'Parsing files...'}</span>
                            </div>
                        )}
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                            {referenceFiles.map((file, index) => {
                                const previewUrl = referencePreviews[index];
                                const isImage = file.type.startsWith('image/');
                                const isAudio = file.type.startsWith('audio/');
                                return (
                                <div key={`${file.name}-${index}`} className="flex flex-col bg-base-300 p-2 rounded-md">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileTypeIcon fileName={file.name} className="w-5 h-5 flex-shrink-0" />
                                            <span className="truncate text-sm text-text-main" title={file.name}>{file.name}</span>
                                        </div>
                                        <button onClick={() => handleRemoveReferenceFile(index)} className="p-1 rounded-full hover:bg-base-100 flex-shrink-0">
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
                            )})}
                        </div>
                         <button onClick={() => document.getElementById('ref-file-upload-multi')?.click()} className="w-full flex items-center justify-center gap-2 text-sm p-2 rounded-md bg-base-300 hover:bg-base-300-hover transition-colors">
                            <UploadIcon className="w-4 h-4"/>
                            {lang === 'vi' ? 'Thêm tệp' : 'Add More Files'}
                        </button>
                    </div>
                ) : (
                    <div 
                        className="relative flex flex-col items-center justify-center p-4 rounded-lg cursor-pointer transition-all duration-300 border-2 border-dashed border-border-color hover:border-brand-secondary"
                        onClick={() => document.getElementById('ref-file-upload-multi')?.click()}
                    >
                        <div className="flex items-center gap-3">
                            <UploadIcon className="w-6 h-6 text-brand-secondary" />
                            <div>
                                <h3 className="font-semibold text-text-main text-sm">{lang === 'vi' ? 'Tải lên tài liệu' : 'Upload Documents'}</h3>
                                <p className="text-xs text-text-subtle">{lang === 'vi' ? 'Dùng để đối chiếu, sửa và thêm câu hỏi.' : 'Used to cross-reference, fix, and add questions.'}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <details className="bg-base-300 rounded-lg group">
                <summary className="p-4 font-semibold cursor-pointer text-text-main list-none flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-6 h-6 text-brand-secondary flex-shrink-0" />
                        <div>
                            <span className="font-bold">{lang === 'vi' ? 'Trợ lý AI' : 'AI Assistant'}</span>
                            <p className="text-sm text-text-subtle font-normal">{lang === 'vi' ? 'Cấu hình model và nguồn kiến thức cho AI.' : 'Configure the model and knowledge source for the AI.'}</p>
                        </div>
                    </div>
                    <ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="p-4 border-t border-border-color space-y-4 animate-fade-in">
                    <div>
                        <label htmlFor="quizModel" className="block font-medium text-text-main text-sm mb-1">
                            {lang === 'vi' ? 'Model AI' : 'AI Model'}
                        </label>
                        <select
                            id="quizModel"
                            value={quiz.model || 'gemini-flash-latest'}
                            onChange={(e) => handleQuizChange('model', e.target.value as GeminiModel)}
                            className="w-full bg-base-100 p-3 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        >
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro ({lang === 'vi' ? 'Mạnh mẽ' : 'Powerful'})</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash ({lang === 'vi' ? 'Cân bằng' : 'Balanced'})</option>
                            <option value="gemini-flash-latest">Gemini Flash Latest ({lang === 'vi' ? 'Nhanh' : 'Fast'})</option>
                            <option value="gemini-flash-lite-latest">Gemini Flash Lite Latest ({lang === 'vi' ? 'Siêu nhẹ' : 'Featherweight'})</option>
                        </select>
                    </div>
                    <ToggleSwitch
                        label={lang === 'vi' ? 'Sử dụng Tìm kiếm trên Web' : 'Use Web Search'}
                        description={lang === 'vi' ? 'AI sẽ tìm kiếm trên web để có câu trả lời cập nhật.' : 'AI will search the web for up-to-date answers.'}
                        enabled={useWebSearch}
                        onChange={setUseWebSearch}
                    />
                    <div>
                        <label htmlFor="knowledge-base-select" className="block font-medium text-text-main text-sm mb-1">
                            {lang === 'vi' ? 'Sử dụng kiến thức từ (chỉ cho Gợi ý)' : 'Use knowledge from (Suggestion only)'}
                        </label>
                        <select
                            id="knowledge-base-select"
                            value={selectedKnowledgeBaseId}
                            onChange={(e) => setSelectedKnowledgeBaseId(e.target.value)}
                            className="w-full bg-base-100 p-3 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        >
                            <option value="__general__">{lang === 'vi' ? 'Kiến thức chung của AI' : 'General AI Knowledge'}</option>
                            <option value="__all__">{lang === 'vi' ? 'Tất cả chuyên môn' : 'All Specialties'}</option>
                            {knowledgeBases.map(kb => (
                                <option key={kb.id} value={kb.id}>{kb.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    {entriesForKb.length > 0 && (
                        <div className="space-y-2 pt-2 animate-fade-in">
                            <h4 className="font-medium text-text-main text-sm">{lang === 'vi' ? 'Chọn bài học cụ thể' : 'Select specific entries'}</h4>
                            <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-base-100 rounded-md border border-border-color">
                                <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-300-hover rounded-md">
                                    <input type="checkbox"
                                        checked={entriesForKb.length > 0 && selectedEntryIds.size === entriesForKb.length}
                                        onChange={handleToggleSelectAllEntries}
                                        className="h-4 w-4 rounded text-brand-primary bg-base-300 border-border-color focus:ring-brand-secondary"
                                    />
                                    <span className="font-semibold text-text-main text-sm">{lang === 'vi' ? 'Chọn tất cả' : 'Select All'}</span>
                                </label>
                                {entriesForKb.map(entry => (
                                    <label key={entry.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-300-hover rounded-md">
                                        <input type="checkbox" 
                                            checked={selectedEntryIds.has(entry.id)}
                                            onChange={() => handleToggleEntry(entry.id)}
                                            className="h-4 w-4 rounded text-brand-primary bg-base-300 border-border-color focus:ring-brand-secondary"
                                        />
                                        <span className="text-text-subtle text-sm">{entry.title}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedKnowledgeBaseId !== '__general__' && (
                        <div className="pt-2">
                            <label htmlFor="integrate-ai-knowledge" className="flex items-center gap-3 cursor-pointer">
                                <input
                                    id="integrate-ai-knowledge"
                                    type="checkbox"
                                    checked={integrateGeneralAI}
                                    onChange={(e) => setIntegrateGeneralAI(e.target.checked)}
                                    className="h-5 w-5 rounded text-brand-primary bg-base-100 border-border-color focus:ring-brand-secondary"
                                />
                                <span className="text-text-main text-sm">{lang === 'vi' ? 'Tích hợp thêm kiến thức chung của AI' : 'Also integrate general AI knowledge'}</span>
                            </label>
                        </div>
                    )}
                </div>
            </details>

             <div className="space-y-3 bg-base-100 p-3 rounded-lg">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={lang === 'vi' ? 'Tìm kiếm câu hỏi...' : 'Search questions...'}
                    className="w-full bg-base-300 p-2 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                    <button 
                        onClick={() => setActiveFilters(new Set())}
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${activeFilters.size === 0 ? 'bg-brand-primary text-text-inverted' : 'bg-base-300 hover:bg-base-300-hover'}`}
                    >
                        {lang === 'vi' ? 'Tất cả' : 'All'}
                    </button>
                    {filterTypes.map(({ type, label, label_vi }) => (
                        <button
                            key={type}
                            onClick={() => handleToggleFilter(type)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full ${activeFilters.has(type) ? 'bg-brand-primary text-text-inverted' : 'bg-base-300 hover:bg-base-300-hover'}`}
                        >
                            {lang === 'vi' ? label_vi : label}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="flex justify-between items-center">
                <div ref={addQuestionMenuRef} className="relative">
                    <button
                        onClick={() => setIsAddQuestionMenuOpen(!isAddQuestionMenuOpen)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors"
                        aria-haspopup="true"
                        aria-expanded={isAddQuestionMenuOpen}
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span className="font-semibold text-sm">{lang === 'vi' ? 'Thêm câu hỏi' : 'Add Question'}</span>
                    </button>
                    {isAddQuestionMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-base-300 rounded-md shadow-lg z-20 border border-border-color py-1 animate-slide-in">
                            <button onClick={() => { setIsAiAddModalOpen(true); setIsAddQuestionMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                                <SparklesIcon className="w-5 h-5 text-text-subtle" />
                                <span>{lang === 'vi' ? 'Thêm bằng AI' : 'Add with AI'}</span>
                            </button>
                            <div className="my-1 h-px bg-border-color"></div>
                            <button onClick={() => handleAddQuestion('multiple-choice')} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                                <ListBulletIcon className="w-5 h-5 text-text-subtle" />
                                <span>{lang === 'vi' ? 'Trắc nghiệm (1 đáp án)' : 'Multiple Choice'}</span>
                            </button>
                            <button onClick={() => handleAddQuestion('multi-true-false')} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                                <CheckBadgeIcon className="w-5 h-5 text-text-subtle" />
                                <span>{lang === 'vi' ? 'Nhiều Đúng/Sai' : 'Multi True/False'}</span>
                            </button>
                                <button onClick={() => handleAddQuestion('short-answer')} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                                <PencilSquareIcon className="w-5 h-5 text-text-subtle" />
                                <span>{lang === 'vi' ? 'Trả lời ngắn' : 'Short Answer'}</span>
                            </button>
                        </div>
                    )}
                </div>
                <button
                    onClick={toggleSelectionMode}
                    className="px-4 py-2 text-sm font-semibold rounded-md bg-base-300 hover:bg-base-300-hover transition-colors"
                >
                    {isSelectionMode ? (lang === 'vi' ? 'Hủy' : 'Cancel') : (lang === 'vi' ? 'Chọn' : 'Select')}
                </button>
            </div>


            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {filteredQuestions.length > 0 ? (
                    filteredQuestions.map(({ question, originalIndex }) => renderQuestionEditor(question, originalIndex))
                ) : (
                    <div className="text-center py-8 text-text-subtle">
                        <p>{lang === 'vi' ? 'Không có câu hỏi nào khớp với tìm kiếm/bộ lọc của bạn.' : 'No questions match your search/filter.'}</p>
                    </div>
                )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-end pt-4 border-t border-border-color">
                <button 
                    onClick={onCancel}
                    className="w-full sm:w-auto bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors"
                >
                    {lang === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                 <button 
                    onClick={() => onSave(quiz)}
                    className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-6 rounded-lg transition-colors text-text-inverted"
                >
                    {lang === 'vi' ? 'Lưu thay đổi' : 'Save Changes'}
                </button>
            </div>
            <SelectionActionBar />
            <ConfirmationModal state={confirmModal} onClose={() => setConfirmModal(null)} lang={lang} />
            {moveModalState.isOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
                    <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in">
                        <h3 id="move-dialog-title" className="text-xl font-bold mb-4">{lang === 'vi' ? `Di chuyển câu ${moveModalState.fromIndex! + 1}` : `Move Question ${moveModalState.fromIndex! + 1}`}</h3>
                        <label htmlFor="move-input" className="block text-sm text-text-subtle mb-2">
                            {lang === 'vi' ? 'Hãy nhập vị trí mà bạn muốn di chuyển đến:' : 'Enter the position you want to move to:'}
                        </label>
                        <input 
                            id="move-input"
                            type="number"
                            value={targetPositionInput}
                            onChange={(e) => setTargetPositionInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleMoveQuestion()}
                            className="w-full bg-base-100 p-2 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                            min="1"
                            max={quiz.questions.length}
                            autoFocus
                        />
                        {moveModalState.error && <p className="text-red-400 text-sm mt-2">{moveModalState.error}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={closeMoveModal} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                                {lang === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={handleMoveQuestion} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold">
                                {lang === 'vi' ? 'Di chuyển' : 'Move'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {fixRequest.isVisible && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
                    <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-lg m-4 animate-scale-in">
                        <h3 className="text-xl font-bold mb-4">{lang === 'vi' ? 'Sửa câu hỏi với AI' : 'Fix Question with AI'}</h3>
                        <p className="text-text-subtle mb-4 text-sm">{lang === 'vi' ? 'Tùy chọn: Thêm ghi chú để hướng dẫn AI sửa lỗi chính xác hơn (ví dụ: "đáp án đúng phải là B, cập nhật lại giải thích").' : 'Optional: Add a note to guide the AI for a more accurate fix (e.g., "the correct answer should be B, please update the explanation").'}</p>
                        <textarea
                            value={fixRequest.prompt}
                            onChange={(e) => setFixRequest(prev => ({ ...prev, prompt: e.target.value }))}
                            className="w-full bg-base-100 p-2 rounded-md text-text-main resize-y border border-border-color"
                            rows={3}
                            placeholder={lang === 'vi' ? 'Nhập ghi chú...' : 'Enter note...'}
                        />
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setFixRequest({ qIndex: -1, isVisible: false, prompt: ''})} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                                {lang === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button onClick={handleFixQuestion} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold flex items-center gap-2">
                                <WrenchScrewdriverIcon className="w-5 h-5"/>
                                {lang === 'vi' ? 'Bắt đầu sửa' : 'Start Fixing'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isAiAddModalOpen && (
                 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
                    <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-lg m-4 animate-scale-in">
                        <h3 className="text-xl font-bold mb-2">{lang === 'vi' ? 'Thêm câu hỏi bằng AI' : 'Add Questions with AI'}</h3>
                        <p className="text-text-subtle mb-4 text-sm">{lang === 'vi' ? 'Nhập số lượng và yêu cầu câu hỏi tùy chỉnh chi tiết bạn muốn.' : 'Enter the number and detailed custom question requirements you want.'}</p>
                        <textarea
                            value={aiAddPrompt}
                            onChange={(e) => setAiAddPrompt(e.target.value)}
                            className="w-full bg-base-100 p-2 rounded-md text-text-main resize-y border border-border-color"
                            rows={5}
                            placeholder={lang === 'vi' ? 'Ví dụ: tạo 5 câu hỏi trắc nghiệm về chương 1...' : 'e.g., create 5 multiple-choice questions about chapter 1...'}
                        />
                         {referenceFileParts === null && <p className="text-text-subtle text-xs mt-2">{lang === 'vi' ? 'Không có tài liệu nào được tải lên. AI sẽ sử dụng kiến thức chung.' : 'No document uploaded. AI will use its general knowledge.'}</p>}
                        <div className="flex justify-end gap-4 mt-6">
                            <button onClick={() => setIsAiAddModalOpen(false)} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                                {lang === 'vi' ? 'Hủy' : 'Cancel'}
                            </button>
                            <button 
                                onClick={handleAiAddQuestions} 
                                disabled={isAiAddingQuestions || !aiAddPrompt.trim()}
                                className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold flex items-center justify-center gap-2 w-32 disabled:opacity-50"
                            >
                                {isAiAddingQuestions ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : (lang === 'vi' ? 'Tạo' : 'Generate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditQuizView;