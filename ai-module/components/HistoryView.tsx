import React, { useState, useRef, useCallback, useMemo } from 'react';
import { GeneratedQuiz, QuizAttempt, Folder, Language, KnowledgeBase } from '../types';
import { EditIcon, EllipsisVerticalIcon, DocumentPlusIcon, FolderIcon, FolderPlusIcon, PlusIcon, MoveIcon, TrashIcon, CheckIcon, BookOpenIcon } from './icons';
import { useOutsideAlerter } from '../hooks/useOutsideAlerter';

interface HistoryViewProps {
  generatedQuizzes: GeneratedQuiz[];
  quizAttempts: QuizAttempt[];
  folders: Folder[];
  knowledgeBases: KnowledgeBase[];
  onStart: (quiz: GeneratedQuiz) => void;
  onReviewAttempt: (attempt: QuizAttempt) => void;
  onResumeAttempt: (attempt: QuizAttempt) => void;
  onEdit: (quiz: GeneratedQuiz) => void;
  onAddNewQuiz: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onMoveQuizzes: (quizIds: string[], folderId: string) => void;
  onDeleteQuizzes: (quizIds: string[]) => void;
  onDeleteAttempts: (attemptIds: string[]) => void;
  onDeleteFolders: (folderIds: string[]) => void;
  onCreateKnowledgeBase: (name: string) => void;
  onRenameKnowledgeBase: (id: string, newName: string) => void;
  onDeleteKnowledgeBase: (id: string) => void;
  onSelectKnowledgeBase: (id: string) => void;
  lang: Language;
}

type ActiveTab = 'generated' | 'folders' | 'attempts' | 'knowledge';

interface ConfirmationModalState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
}

const HistoryView: React.FC<HistoryViewProps> = (props) => {
  const { 
    generatedQuizzes, quizAttempts, folders, knowledgeBases, onStart, 
    onReviewAttempt, onResumeAttempt, onEdit, onAddNewQuiz, onCreateFolder, 
    onRenameFolder, onMoveQuizzes, onDeleteQuizzes, onDeleteAttempts, onDeleteFolders,
    onCreateKnowledgeBase, onRenameKnowledgeBase, onDeleteKnowledgeBase, onSelectKnowledgeBase,
    lang
  } = props;
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('generated');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // Modal State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'rename'>('create');
  const [targetItem, setTargetItem] = useState<Folder | KnowledgeBase | null>(null);
  const [modalInput, setModalInput] = useState('');

  // Move Quiz Modal State
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [quizToMove, setQuizToMove] = useState<GeneratedQuiz | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ConfirmationModalState | null>(null);


  const menuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useOutsideAlerter(menuRef, () => setOpenMenu(null), 'context-menu-trigger');
  useOutsideAlerter(addMenuRef, () => setIsAddMenuOpen(false));
  
  const formatDate = (isoString: string) => {
    const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
    return new Date(isoString).toLocaleString(locale, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // --- Selection Mode Handlers ---
  const handleEnterSelectionMode = useCallback((itemId: string) => {
      setIsSelectionMode(true);
      setSelectedItems(new Set([itemId]));
      setOpenMenu(null);
  }, []);

  const handleExitSelectionMode = useCallback(() => {
      setIsSelectionMode(false);
      setSelectedItems(new Set());
  }, []);

  const handleToggleSelectItem = useCallback((itemId: string) => {
      setSelectedItems(prev => {
          const newSet = new Set(prev);
          if (newSet.has(itemId)) {
              newSet.delete(itemId);
          } else {
              newSet.add(itemId);
          }
          return newSet;
      });
  }, []);

  const handleSelectAll = useCallback(() => {
      let currentVisibleIds: string[] = [];
      if (activeTab === 'generated') currentVisibleIds = generatedQuizzes.map(q => q.id);
      else if (activeTab === 'folders') currentVisibleIds = folders.map(f => f.id);
      else if (activeTab === 'knowledge') currentVisibleIds = knowledgeBases.map(kb => kb.id);
      else if (activeTab === 'attempts') currentVisibleIds = quizAttempts.map(a => a.id);

      if (selectedItems.size === currentVisibleIds.length) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(currentVisibleIds));
      }
  }, [activeTab, generatedQuizzes, folders, knowledgeBases, quizAttempts, selectedItems.size]);

  // --- Generic Modal Handlers ---
  const openCreateModal = (type: 'folder' | 'kb') => {
    setModalMode('create');
    setTargetItem(null);
    if (type === 'folder') {
        setModalInput(lang === 'vi' ? 'Thư mục không tên' : 'Untitled Folder');
        setIsFolderModalOpen(true);
    } else {
        setModalInput(lang === 'vi' ? 'Chuyên môn không tên' : 'Untitled Specialty');
        setIsKbModalOpen(true);
    }
  };

  const openRenameModal = (item: Folder | KnowledgeBase, type: 'folder' | 'kb') => {
    setModalMode('rename');
    setTargetItem(item);
    setModalInput(item.name);
    if (type === 'folder') setIsFolderModalOpen(true);
    else setIsKbModalOpen(true);
  };

  const handleFolderModalSubmit = () => {
    if (modalInput.trim() === '') return;
    if (modalMode === 'create') {
      onCreateFolder(modalInput.trim());
    } else if (targetItem) {
      onRenameFolder(targetItem.id, modalInput.trim());
    }
    setIsFolderModalOpen(false);
  };

  const handleKbModalSubmit = () => {
    if (modalInput.trim() === '') return;
    if (modalMode === 'create') {
      onCreateKnowledgeBase(modalInput.trim());
    } else if (targetItem) {
      onRenameKnowledgeBase(targetItem.id, modalInput.trim());
    }
    setIsKbModalOpen(false);
  }

  // --- Move Quiz Modal Handlers ---
  const openMoveModal = (quiz?: GeneratedQuiz) => {
    setQuizToMove(quiz || null);
    setSelectedFolderId(quiz?.folderId || '__uncategorized__');
    setIsMoveModalOpen(true);
  }

  const handleMoveModalSubmit = () => {
    const quizIdsToMove = quizToMove ? [quizToMove.id] : Array.from(selectedItems);
    if (quizIdsToMove.length > 0 && selectedFolderId) {
        onMoveQuizzes(quizIdsToMove, selectedFolderId);
        setIsMoveModalOpen(false);
        handleExitSelectionMode();
    }
  }

  // --- Delete Handlers ---
  const handleDeleteClick = (type: 'quiz' | 'folder' | 'kb' | 'attempt', item: GeneratedQuiz | Folder | KnowledgeBase | QuizAttempt) => {
      let title = '';
      let message = '';
      let onConfirmAction = () => {};

      if (type === 'quiz') {
        title = lang === 'vi' ? 'Xóa Quiz' : 'Delete Quiz';
        message = lang === 'vi' ? 'Bạn có chắc chắn muốn xóa quiz này không? Tất cả lịch sử làm bài liên quan cũng sẽ bị xóa vĩnh viễn.' : 'Are you sure you want to delete this quiz? All of its attempt history will also be permanently removed.';
        onConfirmAction = () => onDeleteQuizzes([item.id]);
      } else if (type === 'folder') {
        title = lang === 'vi' ? 'Xóa Thư mục' : 'Delete Folder';
        message = lang === 'vi' ? 'Bạn có chắc chắn muốn xóa thư mục này không? Các quiz bên trong sẽ được chuyển về mục "Chưa phân loại".' : 'Are you sure you want to delete this folder? Quizzes inside will become uncategorized.';
        onConfirmAction = () => onDeleteFolders([item.id]);
      } else if (type === 'kb') {
        title = lang === 'vi' ? 'Xóa Chuyên môn' : 'Delete Specialty';
        message = lang === 'vi' ? 'Bạn có chắc chắn muốn xóa chuyên môn này không? Tất cả các bài kiến thức bên trong cũng sẽ bị xóa vĩnh viễn.' : 'Are you sure you want to delete this specialty? All knowledge entries inside will also be permanently deleted.';
        onConfirmAction = () => onDeleteKnowledgeBase(item.id);
      } else if (type === 'attempt') {
        title = lang === 'vi' ? 'Xóa Lần làm bài' : 'Delete Attempt';
        message = lang === 'vi' ? 'Bạn có chắc chắn muốn xóa vĩnh viễn lần làm bài này không?' : 'Are you sure you want to permanently delete this attempt?';
        onConfirmAction = () => onDeleteAttempts([item.id]);
      }

      setConfirmModal({
          isOpen: true,
          title,
          message,
          onConfirm: () => {
              onConfirmAction();
              setConfirmModal(null);
          }
      });
  };
  
  const handleBulkDeleteClick = () => {
      const count = selectedItems.size;
      let title = '';
      let message = '';
      let onConfirmAction = () => {};

      if (activeTab === 'generated') {
          title = lang === 'vi' ? `Xóa ${count} Quiz` : `Delete ${count} Quizzes`;
          message = lang === 'vi' ? `Bạn có chắc chắn muốn xóa ${count} quiz đã chọn không? Hành động này không thể hoàn tác.` : `Are you sure you want to delete the ${count} selected quizzes? This action cannot be undone.`;
          onConfirmAction = () => onDeleteQuizzes(Array.from(selectedItems));
      } else if (activeTab === 'folders') {
          title = lang === 'vi' ? `Xóa ${count} Thư mục` : `Delete ${count} Folders`;
          message = lang === 'vi' ? `Bạn có chắc chắn muốn xóa ${count} thư mục đã chọn không? Các quiz bên trong sẽ được chuyển về mục chưa phân loại.` : `Are you sure you want to delete the ${count} selected folders? Quizzes inside will become uncategorized.`;
          onConfirmAction = () => onDeleteFolders(Array.from(selectedItems));
      } else if (activeTab === 'knowledge') {
          title = lang === 'vi' ? `Xóa ${count} Chuyên môn` : `Delete ${count} Specialties`;
          message = lang === 'vi' ? `Bạn có chắc chắn muốn xóa ${count} chuyên môn đã chọn không? Hành động này không thể hoàn tác.` : `Are you sure you want to delete the ${count} selected specialties? This action cannot be undone.`;
          onConfirmAction = () => Array.from(selectedItems).forEach(id => onDeleteKnowledgeBase(id));
      } else if (activeTab === 'attempts') {
          title = lang === 'vi' ? `Xóa ${count} Lần làm bài` : `Delete ${count} Attempts`;
          message = lang === 'vi' ? `Bạn có chắc chắn muốn xóa ${count} lần làm bài đã chọn không?` : `Are you sure you want to delete the ${count} selected attempts?`;
          onConfirmAction = () => onDeleteAttempts(Array.from(selectedItems));
      }

      setConfirmModal({
          isOpen: true,
          title,
          message,
          onConfirm: () => {
              onConfirmAction();
              setConfirmModal(null);
              handleExitSelectionMode();
          }
      });
  };
  
  const TabButton: React.FC<{tabId: ActiveTab; label: string; count: number}> = ({tabId, label, count}) => (
    <button
        onClick={() => {
            setActiveTab(tabId);
            handleExitSelectionMode();
        }}
        className={`px-3 py-2 text-sm font-semibold rounded-md transition-colors relative
            ${activeTab === tabId ? 'text-text-main' : 'text-text-subtle hover:text-text-main'}`}
    >
        {label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === tabId ? 'bg-brand-primary text-text-inverted' : 'bg-base-300 text-text-subtle'}`}>{count}</span>
        {activeTab === tabId && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"></div>}
    </button>
  );

  const QuizContextMenu: React.FC<{ item: GeneratedQuiz }> = ({ item }) => {
      if (openMenu !== `quiz-${item.id}`) return null;
      return (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-base-100 rounded-md shadow-lg z-10 border border-border-color py-1 animate-fade-in">
            <button onClick={() => handleEnterSelectionMode(item.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <CheckIcon className="w-4 h-4" />{lang === 'vi' ? 'Chọn' : 'Select'}
            </button>
            <button onClick={() => { onEdit(item); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2"><EditIcon className="w-4 h-4" />{lang === 'vi' ? 'Chỉnh sửa Quiz' : 'Edit Quiz'}</button>
            <button onClick={() => { openMoveModal(item); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <MoveIcon className="w-4 h-4" />{lang === 'vi' ? 'Di chuyển quiz' : 'Move Quiz'}
            </button>
            <div className="my-1 h-px bg-border-color"></div>
            <button onClick={() => { handleDeleteClick('quiz', item); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2 text-red-400">
                <TrashIcon className="w-4 h-4" />{lang === 'vi' ? 'Xóa Quiz' : 'Delete Quiz'}
            </button>
        </div>
      )
  }

  const FolderContextMenu: React.FC<{ folder: Folder }> = ({ folder }) => {
    if (openMenu !== `folder-${folder.id}`) return null;
    return (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-base-100 rounded-md shadow-lg z-10 border border-border-color py-1 animate-fade-in">
            <button onClick={() => handleEnterSelectionMode(folder.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <CheckIcon className="w-4 h-4" />{lang === 'vi' ? 'Chọn' : 'Select'}
            </button>
            <button onClick={() => { openRenameModal(folder, 'folder'); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <EditIcon className="w-4 h-4" />{lang === 'vi' ? 'Đổi tên' : 'Rename'}
            </button>
            <div className="my-1 h-px bg-border-color"></div>
            <button onClick={() => { handleDeleteClick('folder', folder); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2 text-red-400">
                <TrashIcon className="w-4 h-4" />{lang === 'vi' ? 'Xóa thư mục' : 'Delete Folder'}
            </button>
        </div>
    );
  };
    
  const KnowledgeBaseContextMenu: React.FC<{ kb: KnowledgeBase }> = ({ kb }) => {
    if (openMenu !== `kb-${kb.id}`) return null;
    return (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-base-100 rounded-md shadow-lg z-10 border border-border-color py-1 animate-fade-in">
            <button onClick={() => { onSelectKnowledgeBase(kb.id); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <EditIcon className="w-4 h-4" />{lang === 'vi' ? 'Chỉnh sửa nội dung' : 'Edit Content'}
            </button>
            <button onClick={() => { openRenameModal(kb, 'kb'); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <EditIcon className="w-4 h-4" />{lang === 'vi' ? 'Đổi tên' : 'Rename'}
            </button>
            <div className="my-1 h-px bg-border-color"></div>
            <button onClick={() => { handleDeleteClick('kb', kb); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2 text-red-400">
                <TrashIcon className="w-4 h-4" />{lang === 'vi' ? 'Xóa chuyên môn' : 'Delete Specialty'}
            </button>
        </div>
    );
  };
  
  const AttemptContextMenu: React.FC<{ item: QuizAttempt }> = ({ item }) => {
      if (openMenu !== `attempt-${item.id}`) return null;
      return (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-48 bg-base-100 rounded-md shadow-lg z-10 border border-border-color py-1 animate-fade-in">
            <button onClick={() => handleEnterSelectionMode(item.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2">
                <CheckIcon className="w-4 h-4" />{lang === 'vi' ? 'Chọn' : 'Select'}
            </button>
            <div className="my-1 h-px bg-border-color"></div>
            <button onClick={() => { handleDeleteClick('attempt', item); setOpenMenu(null); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-300 flex items-center gap-2 text-red-400">
                <TrashIcon className="w-4 h-4" />{lang === 'vi' ? 'Xóa' : 'Delete'}
            </button>
        </div>
      )
  }

  const SelectionCheckbox: React.FC<{id: string}> = ({id}) => {
      const isSelected = selectedItems.has(id);
      return (
          <div 
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mr-3 transition-all ${isSelected ? 'bg-brand-primary border-brand-secondary' : 'bg-base-300 border-border-color'}`}
            onClick={(e) => { e.stopPropagation(); handleToggleSelectItem(id); }}
          >
              {isSelected && <CheckIcon className="w-4 h-4 text-white"/>}
          </div>
      );
  }

  const QuizItem: React.FC<{quiz: GeneratedQuiz}> = ({ quiz }) => (
      <li 
        className={`flex items-center p-3 rounded-lg transition-colors ${isSelectionMode ? 'cursor-pointer bg-base-100 hover:bg-base-300' : 'bg-base-100'}`}
        onClick={isSelectionMode ? () => handleToggleSelectItem(quiz.id) : undefined}
      >
        {isSelectionMode && <SelectionCheckbox id={quiz.id} />}
        <div className="flex-grow mr-4 overflow-hidden">
          <p className="font-semibold truncate text-text-main" title={quiz.title}>{quiz.title}</p>
          <p className="text-sm text-text-subtle">{quiz.questions.length} {lang === 'vi' ? 'câu hỏi' : 'questions'} • {lang === 'vi' ? 'Tạo lúc' : 'Created'} {formatDate(quiz.createdAt)}</p>
        </div>
        {!isSelectionMode && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onStart(quiz)} className="px-4 py-1.5 text-sm font-semibold bg-brand-primary hover:bg-brand-primary-hover rounded-md transition-colors text-text-inverted">{lang === 'vi' ? 'Bắt đầu' : 'Start'}</button>
            <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === `quiz-${quiz.id}` ? null : `quiz-${quiz.id}`)} className="p-2 text-text-subtle hover:text-text-main rounded-full hover:bg-base-300 transition-colors context-menu-trigger" aria-label={lang === 'vi' ? 'Tùy chọn khác' : 'More options'}>
                  <EllipsisVerticalIcon className="w-5 h-5" />
              </button>
              <QuizContextMenu item={quiz} />
            </div>
          </div>
        )}
      </li>
  )

  const renderGeneratedQuizzes = () => {
    const uncategorizedQuizzes = generatedQuizzes.filter(q => !q.folderId);
    if (generatedQuizzes.length === 0 && folders.length === 0) {
        return <p className="text-center text-text-subtle py-4">{lang === 'vi' ? 'Chưa có quiz nào được tạo.' : 'No quizzes generated yet.'}</p>;
    }
    return (
        <div className="space-y-4">
            {folders.map(folder => {
                const quizzesInFolder = generatedQuizzes.filter(q => q.folderId === folder.id);
                return (
                    <details key={folder.id} open className="space-y-2 group">
                        <summary className="flex items-center justify-between p-2 cursor-pointer rounded-md hover:bg-base-300 list-none">
                            <div className="flex items-center gap-2 font-semibold">
                                <FolderIcon className="w-5 h-5 text-brand-secondary"/> {folder.name} ({quizzesInFolder.length})
                            </div>
                        </summary>
                        <ul className="space-y-2 pl-4 border-l-2 border-border-color ml-2">
                           {quizzesInFolder.length > 0 ? quizzesInFolder.map(quiz => <QuizItem key={quiz.id} quiz={quiz} />) : <li className="text-center text-text-subtle text-sm py-2">{lang === 'vi' ? 'Thư mục này trống.' : 'This folder is empty.'}</li>}
                        </ul>
                    </details>
                )
            })}
            {uncategorizedQuizzes.length > 0 && (
                <div>
                    <h3 className="font-semibold text-text-subtle mt-4 mb-2 px-2">{lang === 'vi' ? 'Chưa phân loại' : 'Uncategorized'}</h3>
                    <ul className="space-y-2">
                        {uncategorizedQuizzes.map(quiz => <QuizItem key={quiz.id} quiz={quiz}/>)}
                    </ul>
                </div>
            )}
        </div>
    )
  };

  const renderQuizAttempts = () => (
     <ul className="space-y-2">
      {quizAttempts.map((attempt) => {
        const isCompleted = attempt.status === 'completed' || !attempt.status;
        return (
            <li 
                key={attempt.id} 
                className={`flex items-center p-3 rounded-lg transition-colors ${isSelectionMode ? 'cursor-pointer bg-base-100 hover:bg-base-300' : 'bg-base-100'}`}
                onClick={isSelectionMode ? () => handleToggleSelectItem(attempt.id) : undefined}
            >
                {isSelectionMode && <SelectionCheckbox id={attempt.id} />}
                <div className="flex-grow mr-4 overflow-hidden">
                    <p className="font-semibold truncate text-text-main" title={attempt.quizTitle}>{attempt.quizTitle}</p>
                    <div className="text-sm text-text-subtle flex items-center gap-2 flex-wrap">
                        <span>{lang === 'vi' ? 'Điểm' : 'Score'}: {attempt.score}/{attempt.totalQuestions}</span>
                        <span className="text-border-color hidden sm:inline">•</span>
                        <span>{lang === 'vi' ? 'Lúc' : 'Taken'} {formatDate(attempt.date)}</span>
                        {!isCompleted && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-semibold">{lang === 'vi' ? 'Đang thực hiện' : 'In Progress'}</span>}
                    </div>
                </div>
                {!isSelectionMode && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {isCompleted ? (
                            <button onClick={() => onReviewAttempt(attempt)} className="px-4 py-1.5 text-sm font-semibold bg-base-300 hover:bg-base-300-hover rounded-md transition-colors text-text-main">{lang === 'vi' ? 'Xem lại' : 'Review'}</button>
                        ) : (
                            <button onClick={() => onResumeAttempt(attempt)} className="px-4 py-1.5 text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary-hover rounded-md transition-colors text-text-inverted">{lang === 'vi' ? 'Tiếp tục' : 'Resume'}</button>
                        )}
                        <div className="relative">
                            <button onClick={() => setOpenMenu(openMenu === `attempt-${attempt.id}` ? null : `attempt-${attempt.id}`)} className="p-2 text-text-subtle hover:text-text-main rounded-full hover:bg-base-300 transition-colors context-menu-trigger" aria-label={lang === 'vi' ? 'Tùy chọn khác' : 'More options'}>
                                <EllipsisVerticalIcon className="w-5 h-5" />
                            </button>
                            <AttemptContextMenu item={attempt} />
                        </div>
                    </div>
                )}
            </li>
        )
      })}
    </ul>
  );

  const renderFolders = () => (
    <ul className="space-y-2">
     {folders.map((folder) => (
       <li key={folder.id} 
          className={`flex items-center justify-between p-3 rounded-lg transition-colors ${isSelectionMode ? 'cursor-pointer bg-base-100 hover:bg-base-300' : 'bg-base-100'}`}
          onClick={isSelectionMode ? () => handleToggleSelectItem(folder.id) : undefined}
        >
         {isSelectionMode && <SelectionCheckbox id={folder.id} />}
         <div className="flex items-center gap-3 flex-grow">
           <FolderIcon className="w-5 h-5 text-brand-secondary"/>
           <p className="font-semibold text-text-main">{folder.name}</p>
         </div>
         {!isSelectionMode && (
          <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === `folder-${folder.id}` ? null : `folder-${folder.id}`)} className="p-2 text-text-subtle hover:text-text-main rounded-full hover:bg-base-300 transition-colors context-menu-trigger" aria-label={lang === 'vi' ? 'Tùy chọn khác' : 'More options'}>
                <EllipsisVerticalIcon className="w-5 h-5" />
              </button>
              <FolderContextMenu folder={folder} />
          </div>
         )}
       </li>
     ))}
   </ul>
  );
  
  const renderKnowledgeBases = () => (
    <ul className="space-y-2">
     {knowledgeBases.map((kb) => (
       <li key={kb.id} 
          className={`flex items-center justify-between p-3 rounded-lg transition-colors group ${isSelectionMode ? 'cursor-pointer bg-base-100 hover:bg-base-300' : 'bg-base-100'}`}
          onClick={isSelectionMode ? () => handleToggleSelectItem(kb.id) : () => onSelectKnowledgeBase(kb.id)}
        >
         {isSelectionMode && <SelectionCheckbox id={kb.id} />}
         <div className="flex items-center gap-3 flex-grow overflow-hidden">
           <BookOpenIcon className="w-5 h-5 text-brand-secondary flex-shrink-0"/>
           <div className="flex-grow overflow-hidden">
                <p className="font-semibold text-text-main truncate group-hover:text-brand-primary" title={kb.name}>{kb.name}</p>
                <p className="text-sm text-text-subtle">{lang === 'vi' ? 'Tạo lúc' : 'Created'} {formatDate(kb.createdAt)}</p>
           </div>
         </div>
         {!isSelectionMode && (
          <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === `kb-${kb.id}` ? null : `kb-${kb.id}`); }} className="p-2 text-text-subtle hover:text-text-main rounded-full hover:bg-base-300 transition-colors context-menu-trigger" aria-label={lang === 'vi' ? 'Tùy chọn khác' : 'More options'}>
                <EllipsisVerticalIcon className="w-5 h-5" />
              </button>
              <KnowledgeBaseContextMenu kb={kb} />
          </div>
         )}
       </li>
     ))}
   </ul>
  );
  
  const ConfirmationModal: React.FC<{state: ConfirmationModalState | null; onClose: () => void; lang: Language}> = ({ state, onClose, lang }) => {
    if (!state || !state.isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in border border-border-color">
                <h3 id="confirm-title" className="text-xl font-bold mb-4">{state.title}</h3>
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
  
  const SelectionActionBar = () => {
    if (!isSelectionMode) return null;
    let currentItemCount = 0;
    if (activeTab === 'generated') currentItemCount = generatedQuizzes.length;
    else if (activeTab === 'folders') currentItemCount = folders.length;
    else if (activeTab === 'knowledge') currentItemCount = knowledgeBases.length;
    else if (activeTab === 'attempts') currentItemCount = quizAttempts.length;
    
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30 px-4">
            <div className="bg-base-200/80 backdrop-blur-md p-3 rounded-xl shadow-lg flex items-center justify-between gap-4 border border-border-color animate-slide-in">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleSelectAll}
                        className="px-3 py-1.5 text-sm font-semibold bg-base-300 hover:bg-base-300-hover rounded-md transition-colors"
                    >
                        {selectedItems.size === currentItemCount && currentItemCount > 0 ? (lang === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect All') : (lang === 'vi' ? 'Chọn tất cả' : 'Select All')}
                    </button>
                    <span className="text-sm font-semibold text-text-main">{selectedItems.size} {lang === 'vi' ? 'đã chọn' : 'selected'}</span>
                </div>
                <div className="flex items-center gap-2">
                    {activeTab === 'generated' && (
                        <button onClick={() => openMoveModal()} disabled={selectedItems.size === 0} className="p-2 text-sm text-text-main hover:bg-base-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" aria-label={lang === 'vi' ? 'Di chuyển' : 'Move'}>
                            <MoveIcon className="w-5 h-5"/>
                        </button>
                    )}
                    <button onClick={handleBulkDeleteClick} disabled={selectedItems.size === 0} className="p-2 text-sm text-red-400 hover:bg-red-900/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed" aria-label={lang === 'vi' ? 'Xóa' : 'Delete'}>
                        <TrashIcon className="w-5 h-5"/>
                    </button>
                     <button onClick={handleExitSelectionMode} className="px-3 py-1.5 text-sm font-semibold bg-base-300 hover:bg-base-300-hover rounded-md transition-colors">
                        {lang === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    )
  }

  return (
    <div className="mt-12 animate-fade-in w-full">
      <div className="bg-base-200 p-4 sm:p-6 rounded-xl shadow-lg border border-border-color">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
            <h2 className="text-xl font-bold text-text-main">{lang === 'vi' ? 'Lịch sử & Thao tác' : 'History & Actions'}</h2>
            <div ref={addMenuRef} className="relative">
                <button 
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors"
                  aria-haspopup="true"
                  aria-expanded={isAddMenuOpen}
                >
                    <PlusIcon className="w-5 h-5" />
                    <span className="font-semibold text-sm">{lang === 'vi' ? 'Thêm mới' : 'Add New'}</span>
                </button>
                {isAddMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-60 bg-base-300 rounded-md shadow-lg z-20 border border-border-color py-1 animate-fade-in">
                        <button onClick={() => { onAddNewQuiz(); setIsAddMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                          <DocumentPlusIcon className="w-5 h-5 text-text-subtle" />
                          <span>{lang === 'vi' ? 'Tạo Quiz thủ công' : 'Create Manual Quiz'}</span>
                        </button>
                         <button onClick={() => { openCreateModal('folder'); setIsAddMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                          <FolderPlusIcon className="w-5 h-5 text-text-subtle" />
                          <span>{lang === 'vi' ? 'Tạo thư mục mới' : 'Create New Folder'}</span>
                        </button>
                         <button onClick={() => { openCreateModal('kb'); setIsAddMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-base-100 flex items-center gap-3">
                          <BookOpenIcon className="w-5 h-5 text-text-subtle" />
                          <span>{lang === 'vi' ? 'Tạo kiến thức chuyên môn' : 'Create Knowledge Base'}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
        <div className="border-b border-border-color mb-4">
            <div className="flex overflow-x-auto">
                <TabButton tabId="generated" label={lang === 'vi' ? 'Quiz đã tạo' : 'Generated Quizzes'} count={generatedQuizzes.length}/>
                <TabButton tabId="folders" label={lang === 'vi' ? 'Thư mục' : 'Folders'} count={folders.length}/>
                <TabButton tabId="knowledge" label={lang === 'vi' ? 'Kiến thức' : 'Knowledge'} count={knowledgeBases.length} />
                <TabButton tabId="attempts" label={lang === 'vi' ? 'Lần làm bài' : 'Quiz Attempts'} count={quizAttempts.length}/>
            </div>
        </div>
        <div key={activeTab} className="space-y-4 animate-fast-fade-in min-h-[200px]">
            {activeTab === 'generated' && renderGeneratedQuizzes()}
            {activeTab === 'folders' && (folders.length > 0 ? renderFolders() : <p className="text-center text-text-subtle py-4">{lang === 'vi' ? 'Chưa có thư mục nào được tạo.' : 'No folders created yet.'}</p>)}
            {activeTab === 'knowledge' && (knowledgeBases.length > 0 ? renderKnowledgeBases() : <p className="text-center text-text-subtle py-4">{lang === 'vi' ? 'Chưa có kiến thức chuyên môn nào được tạo.' : 'No knowledge bases created yet.'}</p>)}
            {activeTab === 'attempts' && (quizAttempts.length > 0 ? renderQuizAttempts() : <p className="text-center text-text-subtle py-4">{lang === 'vi' ? 'Chưa có lần làm bài nào được ghi nhận.' : 'No quiz attempts recorded yet.'}</p>)}
        </div>
      </div>

      <SelectionActionBar />

      {(isFolderModalOpen || isKbModalOpen) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in border border-border-color">
                <h3 className="text-xl font-bold mb-4">
                    { isFolderModalOpen 
                        ? (modalMode === 'create' ? (lang === 'vi' ? 'Tạo thư mục mới' : 'Create New Folder') : (lang === 'vi' ? 'Đổi tên thư mục' : 'Rename Folder'))
                        : (modalMode === 'create' ? (lang === 'vi' ? 'Tạo chuyên môn mới' : 'Create New Specialty') : (lang === 'vi' ? 'Đổi tên chuyên môn' : 'Rename Specialty'))
                    }
                </h3>
                <input 
                    type="text"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (isFolderModalOpen ? handleFolderModalSubmit() : handleKbModalSubmit())}
                    className="w-full bg-base-100 p-2 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                    placeholder={lang === 'vi' ? 'Nhập tên...' : 'Enter name...'}
                    onFocus={e => e.target.select()}
                    autoFocus
                />
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={() => { setIsFolderModalOpen(false); setIsKbModalOpen(false); }} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={isFolderModalOpen ? handleFolderModalSubmit : handleKbModalSubmit} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold">
                        {modalMode === 'create' ? (lang === 'vi' ? 'Tạo' : 'Create') : (lang === 'vi' ? 'Lưu' : 'Save')}
                    </button>
                </div>
            </div>
        </div>
      )}

    {isMoveModalOpen && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in border border-border-color">
                <h3 className="text-xl font-bold mb-2">{lang === 'vi' ? 'Di chuyển Quiz' : 'Move Quiz'}</h3>
                <p className="text-sm text-text-subtle mb-4 truncate">
                    {quizToMove 
                      ? <>{lang === 'vi' ? 'Di chuyển ' : 'Move '}<span className="font-semibold text-text-main">'{quizToMove.title}'</span>{lang === 'vi' ? ' vào thư mục:' : ' to folder:'}</>
                      : <>{lang === 'vi' ? `Di chuyển ${selectedItems.size} quiz đã chọn vào thư mục:` : `Move ${selectedItems.size} selected quizzes to folder:`}</>
                    }
                </p>
                
                <select 
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full bg-base-100 p-3 rounded-md text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none"
                    >
                    <option value="__uncategorized__">{lang === 'vi' ? 'Chưa phân loại' : 'Uncategorized'}</option>
                    {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                </select>

                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={() => setIsMoveModalOpen(false)} className="px-4 py-2 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={handleMoveModalSubmit} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold" disabled={!selectedFolderId}>
                        {lang === 'vi' ? 'Di chuyển' : 'Move'}
                    </button>
                </div>
            </div>
        </div>
    )}

    <ConfirmationModal state={confirmModal} onClose={() => setConfirmModal(null)} lang={lang} />

    </div>
  );
};

export default HistoryView;