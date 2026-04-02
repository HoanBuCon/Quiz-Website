import React, { useState, useRef, useLayoutEffect } from 'react';
import { KnowledgeBase, KnowledgeEntry, KnowledgeBlock, Language } from '../types';
import { BackIcon, PlusIcon, EditIcon, TrashIcon, CheckIcon, CloseIcon, ImageIcon, MusicalNoteIcon, PencilSquareIcon } from './icons';
import LatexRenderer from './LatexRenderer';

interface KnowledgeBaseViewProps {
  knowledgeBase: KnowledgeBase;
  entries: KnowledgeEntry[];
  onBack: () => void;
  onSaveEntry: (entry: KnowledgeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  onRenameKnowledgeBase: (id: string, newName: string) => void;
  lang: Language;
}

const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const data = result.split(',')[1];
      resolve({ data, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });
};

const AutosizeTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [props.value]);

    return <textarea ref={textareaRef} {...props} />;
};

// --- Sub-component for the dedicated editor view ---
const EntryEditor: React.FC<{
    entry: KnowledgeEntry;
    onSave: (updatedEntry: KnowledgeEntry) => void;
    onCancel: () => void;
    lang: Language;
}> = ({ entry, onSave, onCancel, lang }) => {
    const [editingTitle, setEditingTitle] = useState(entry.title);
    const [editingBlocks, setEditingBlocks] = useState<KnowledgeBlock[]>([...entry.contentBlocks]);
    const [isPreview, setIsPreview] = useState(false);
    
    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        onSave({ ...entry, title: editingTitle, contentBlocks: editingBlocks });
    };
    
    const handleAddBlock = (type: 'text' | 'image' | 'audio') => {
        if (type === 'text') {
            setEditingBlocks(prev => [...prev, { type: 'text', content: '' }]);
        } else if (type === 'image') {
            imageInputRef.current?.click();
        } else if (type === 'audio') {
            audioInputRef.current?.click();
        }
    };
    
    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const { data, mimeType } = await fileToBase64(file);
            setEditingBlocks(prev => [...prev, { type, content: data, mimeType }]);
            e.target.value = '';
        }
    };

    const handleBlockChange = (index: number, content: string) => {
        setEditingBlocks(prev => {
            const newBlocks = [...prev];
            const block = newBlocks[index];
            if (block.type === 'text') {
                block.content = content;
            }
            return newBlocks;
        });
    };

    const handleDeleteBlock = (index: number) => {
        setEditingBlocks(prev => prev.filter((_, i) => i !== index));
    };
    
    return (
        <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg relative max-w-4xl w-full mx-auto space-y-4 animate-fade-in">
             <input type="file" ref={imageInputRef} onChange={(e) => handleMediaUpload(e, 'image')} hidden accept="image/*" />
             <input type="file" ref={audioInputRef} onChange={(e) => handleMediaUpload(e, 'audio')} hidden accept="audio/*" />

            <header className="flex justify-between items-center pb-4 border-b border-border-color">
                <button onClick={onCancel} className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Quay lại' : 'Go back'}>
                    <BackIcon className="w-6 h-6"/>
                </button>
                <h2 className="text-xl font-bold">{lang === 'vi' ? 'Chỉnh sửa bài học' : 'Editing Entry'}</h2>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsPreview(!isPreview)} className="px-4 py-2 text-sm font-semibold rounded-md bg-base-300 text-text-main hover:bg-base-300-hover transition-colors">
                        {isPreview ? (lang === 'vi' ? 'Sửa' : 'Edit') : (lang === 'vi' ? 'Xem trước' : 'Preview')}
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold rounded-md bg-brand-primary text-text-inverted hover:bg-brand-primary-hover transition-colors">{lang === 'vi' ? 'Lưu' : 'Save'}</button>
                </div>
            </header>

            <main className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                 {isPreview ? (
                    <div className="w-full bg-transparent text-2xl font-bold text-text-main py-1 whitespace-pre-wrap">
                      {editingTitle}
                    </div>
                  ) : (
                    <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full bg-transparent text-2xl font-bold text-text-main focus:outline-none border-b-2 border-transparent focus:border-brand-primary transition-colors"
                        placeholder={lang === 'vi' ? 'Nhập tiêu đề...' : 'Enter title...'}
                        onFocus={e => e.target.select()}
                    />
                )}
                <div className="space-y-3">
                    {editingBlocks.map((block, index) => (
                        <div key={index} className="relative group">
                            <button onClick={() => handleDeleteBlock(index)} className="absolute -top-2 -right-2 z-10 p-1 bg-base-100 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <CloseIcon className="w-4 h-4" />
                            </button>
                            {block.type === 'text' && (
                                isPreview ? (
                                    <div className="w-full bg-base-100 p-3 rounded-md text-text-main min-h-[50px]">
                                        <LatexRenderer text={block.content} />
                                    </div>
                                ) : (
                                    <AutosizeTextarea
                                        value={block.content}
                                        onChange={(e) => handleBlockChange(index, e.target.value)}
                                        className="w-full bg-base-100 p-3 rounded-md text-text-main resize-none overflow-hidden"
                                        placeholder={lang === 'vi' ? 'Bắt đầu nhập...' : 'Start typing...'}
                                    />
                                )
                            )}
                            {block.type === 'image' && (
                                <img src={`data:${block.mimeType};base64,${block.content}`} alt="Note content" className="max-w-full rounded-md"/>
                            )}
                            {block.type === 'audio' && (
                                <audio controls src={`data:${block.mimeType};base64,${block.content}`} className="w-full"/>
                            )}
                        </div>
                    ))}
                </div>
            </main>

            <footer className="flex flex-wrap items-center gap-2 border-t border-border-color pt-4">
                <button onClick={() => handleAddBlock('text')} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-base-100 transition-colors text-text-subtle" aria-label={lang === 'vi' ? 'Thêm văn bản' : 'Add text'}>
                    <PencilSquareIcon className="w-5 h-5"/>
                    <span className="text-sm font-semibold">{lang === 'vi' ? 'Văn bản' : 'Text'}</span>
                </button>
                <button onClick={() => handleAddBlock('image')} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-base-100 transition-colors text-text-subtle" aria-label={lang === 'vi' ? 'Thêm hình ảnh' : 'Add image'}>
                    <ImageIcon className="w-5 h-5"/>
                    <span className="text-sm font-semibold">{lang === 'vi' ? 'Hình ảnh' : 'Image'}</span>
                </button>
                <button onClick={() => handleAddBlock('audio')} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-base-100 transition-colors text-text-subtle" aria-label={lang === 'vi' ? 'Thêm âm thanh' : 'Add audio'}>
                    <MusicalNoteIcon className="w-5 h-5"/>
                    <span className="text-sm font-semibold">{lang === 'vi' ? 'Âm thanh' : 'Audio'}</span>
                </button>
            </footer>
        </div>
    );
};


const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ 
    knowledgeBase, entries, onBack, onSaveEntry, onDeleteEntry, onRenameKnowledgeBase, lang 
}) => {
    const [viewingEntry, setViewingEntry] = useState<KnowledgeEntry | null>(null);
    const [isRenamingKb, setIsRenamingKb] = useState(false);
    const [kbNameInput, setKbNameInput] = useState(knowledgeBase.name);
    
    const handleAddNewEntry = () => {
        const newEntry: KnowledgeEntry = {
            id: `${Date.now()}-entry`,
            knowledgeBaseId: knowledgeBase.id,
            title: lang === 'vi' ? 'Bài học mới' : 'New Entry',
            contentBlocks: [{ type: 'text', content: '' }],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
        };
        onSaveEntry(newEntry);
        setViewingEntry(newEntry);
    };
    
    const handleSaveAndCloseEntry = (updatedEntry: KnowledgeEntry) => {
        onSaveEntry(updatedEntry);
        setViewingEntry(null);
    };

    const handleRenameKb = () => {
        if (kbNameInput.trim() && kbNameInput.trim() !== knowledgeBase.name) {
            onRenameKnowledgeBase(knowledgeBase.id, kbNameInput.trim());
        }
        setIsRenamingKb(false);
    };
    
    const formatDate = (isoString: string) => {
        const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
        return new Date(isoString).toLocaleString(locale, {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };
    
    if (viewingEntry) {
        return (
            <EntryEditor 
                entry={viewingEntry}
                onSave={handleSaveAndCloseEntry}
                onCancel={() => setViewingEntry(null)}
                lang={lang}
            />
        )
    }

    return (
        <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg relative max-w-4xl w-full mx-auto space-y-6">
            <header className="flex items-center justify-between pb-4 border-b border-border-color">
                <button onClick={onBack} className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Quay lại' : 'Go back'}>
                    <BackIcon className="w-6 h-6"/>
                    <span className="text-sm font-semibold hidden sm:inline">{lang === 'vi' ? 'Quay lại' : 'Back'}</span>
                </button>
                <div className="text-center">
                    {isRenamingKb ? (
                        <input
                            type="text"
                            value={kbNameInput}
                            onChange={(e) => setKbNameInput(e.target.value)}
                            onBlur={handleRenameKb}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameKb()}
                            className="text-2xl font-bold bg-base-300 text-text-main rounded-md px-2 py-1 text-center"
                            autoFocus
                        />
                    ) : (
                        <h2 className="text-2xl font-bold" onClick={() => setIsRenamingKb(true)}>{knowledgeBase.name}</h2>
                    )}
                    <p className="text-sm text-text-subtle">{lang === 'vi' ? 'Kiến thức chuyên môn' : 'Knowledge Base'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsRenamingKb(true)} className="p-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Đổi tên' : 'Rename'}>
                        <EditIcon className="w-5 h-5"/>
                    </button>
                    <button onClick={handleAddNewEntry} className="flex items-center gap-2 px-3 py-2 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors" >
                        <PlusIcon className="w-5 h-5" />
                        <span className="font-semibold text-sm hidden sm:inline">{lang === 'vi' ? 'Bài mới' : 'New Entry'}</span>
                    </button>
                </div>
            </header>
            
            <main className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
                {entries.length === 0 && (
                    <p className="text-center text-text-subtle py-8">{lang === 'vi' ? 'Chưa có bài kiến thức nào. Hãy tạo một bài mới!' : 'No knowledge entries yet. Create one to get started!'}</p>
                )}
                {entries.map(entry => (
                     <div 
                        key={entry.id} 
                        className="flex items-center justify-between p-4 rounded-lg bg-base-300 hover:bg-base-300-hover cursor-pointer transition-colors animate-fade-in"
                        onClick={() => setViewingEntry(entry)}
                    >
                        <div>
                            <h3 className="font-semibold text-text-main whitespace-pre-wrap">{entry.title}</h3>
                            <p className="text-xs text-text-subtle">
                                {lang === 'vi' ? 'Cập nhật lần cuối: ' : 'Last updated: '} {formatDate(entry.lastModified)}
                            </p>
                        </div>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(lang === 'vi' ? 'Bạn có chắc muốn xóa bài học này không?' : 'Are you sure you want to delete this entry?')) {
                                    onDeleteEntry(entry.id);
                                }
                            }}
                            className="p-2 rounded-full text-text-subtle hover:bg-red-900/50 hover:text-red-400 opacity-50 hover:opacity-100 transition-colors"
                            aria-label={lang === 'vi' ? 'Xóa' : 'Delete'}
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                ))}
            </main>
        </div>
    );
};

export default KnowledgeBaseView;