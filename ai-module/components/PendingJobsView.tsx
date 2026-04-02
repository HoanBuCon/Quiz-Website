import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProcessingJob } from '../App';
import { GeneratedQuiz, Language } from '../types';
import { CloseIcon, SpinnerIcon, CheckCircleIcon, XCircleIcon, StopCircleIcon, ChevronDownIcon, ExclamationTriangleIcon, TrashIcon, FileTypeIcon, BookOpenIcon } from './icons';
import LoadingQAnimation from './LoadingQAnimation';

interface PendingJobsViewProps {
  jobs: ProcessingJob[];
  onCancel: (jobId: string) => void;
  onClear: (jobIds: string[]) => void;
  onCompleteClick: (quiz: GeneratedQuiz) => void;
  lang: Language;
}

const StatusIcon: React.FC<{ status: ProcessingJob['status'] }> = ({ status }) => {
  switch (status) {
    case 'processing':
      return <SpinnerIcon className="w-5 h-5 text-blue-400 animate-spin" />;
    case 'completed':
      return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
    case 'error':
      return <XCircleIcon className="w-5 h-5 text-red-400" />;
    case 'cancelled':
      return <StopCircleIcon className="w-5 h-5 text-slate-500" />;
    default:
      return null;
  }
};

const PendingJobsView: React.FC<PendingJobsViewProps> = ({ jobs, onCancel, onClear, onCompleteClick, lang }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hideTimeoutRef = useRef<number | null>(null);

  // --- Auto-hide logic ---
  const clearHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsHiding(true);
    }, 5000);
  }, [clearHideTimer]);

  useEffect(() => {
    const areAllJobsComplete = jobs.length > 0 && jobs.every(job => job.status !== 'processing');
    
    if (areAllJobsComplete) {
      startHideTimer();
    } else {
      clearHideTimer();
      setIsHiding(false);
    }
    
    return clearHideTimer;
  }, [jobs, startHideTimer, clearHideTimer]);

  // --- Dragging logic ---
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button:not([data-draggable="true"])')) {
        return;
    }

    clearHideTimer();

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setIsDragging(true);
    }
  }, [clearHideTimer]);

  // Handle dragging with global listeners
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
       // Prevent text selection while dragging
      e.preventDefault();
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      document.body.style.cursor = 'grabbing';
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);
  
  // --- Interaction handlers to pause hiding ---
  const handlePointerEnter = () => {
    clearHideTimer();
  };
  
  const handlePointerLeave = () => {
    const areAllJobsComplete = jobs.length > 0 && jobs.every(job => job.status !== 'processing');
    if (areAllJobsComplete) {
      startHideTimer();
    }
  };

  // Set initial position
  useEffect(() => {
    if (containerRef.current && position === null) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: window.innerWidth / 2 - rect.width / 2,
        y: 16, // Corresponds to top-4
      });
    }
  }, [position, jobs]); // Re-check if jobs appear for the first time
  
  if (jobs.length === 0) {
    return null;
  }
  
  const dynamicStyle: React.CSSProperties = position ? {
    position: 'fixed',
    top: `${position.y}px`,
    left: `${position.x}px`,
    zIndex: 40,
    transform: 'none',
  } : {
    visibility: 'hidden'
  };

  const renderMinimizedView = () => {
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const segmentCount = jobs.length;
    const strokeWidth = 5;
    const gap = 0; // Set to 0 for a seamless ring
    const visibleSegmentLength = (circumference / segmentCount) - gap;

    const hasProcessing = jobs.some(j => j.status === 'processing');
    let IconToShow, iconColor, iconAnimation;

    if (!hasProcessing) {
        const hasError = jobs.some(j => j.status === 'error');
        const hasSuccess = jobs.some(j => j.status === 'completed');
        
        if (hasSuccess && !hasError) {
            IconToShow = CheckCircleIcon;
            iconColor = "text-green-400";
        } else if (hasSuccess && hasError) {
            IconToShow = ExclamationTriangleIcon;
            iconColor = "text-yellow-400";
        } else {
            IconToShow = XCircleIcon;
            iconColor = "text-red-400";
        }
    }

    return (
      <div className="relative">
        <button
          onClick={() => setIsMinimized(false)}
          onPointerDown={handlePointerDown}
          style={{ touchAction: 'none', cursor: 'grab' }}
          className="w-16 h-16 bg-base-300 rounded-full shadow-2xl flex items-center justify-center border border-border-color hover:bg-base-300-hover transition-colors relative"
          aria-label={lang === 'vi' ? `Mở rộng tác vụ (${jobs.length})` : `Expand tasks (${jobs.length})`}
          data-draggable="true"
        >
          <svg className="w-full h-full absolute inset-0" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="transparent"
              stroke="currentColor"
              className="text-base-100"
              strokeWidth={strokeWidth}
            />
            {jobs.map((job, index) => {
              const rotation = (360 / segmentCount) * index;
              let segmentColorClass = "text-border-color";
              if (job.status === 'completed') segmentColorClass = "text-green-500";
              if (job.status === 'error') segmentColorClass = "text-red-500";
              if (job.status === 'processing') segmentColorClass = "text-blue-500";

              return (
                <circle
                  key={job.id}
                  cx="32"
                  cy="32"
                  r={radius}
                  fill="transparent"
                  stroke="currentColor"
                  className={`${segmentColorClass} transition-all duration-300`}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${visibleSegmentLength} ${circumference}`}
                  strokeLinecap="butt"
                  style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '32px 32px' }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
             {hasProcessing ? (
                <LoadingQAnimation />
            ) : (
                IconToShow && <IconToShow className={`w-8 h-8 z-10 ${iconColor || ''} ${iconAnimation || ''}`} />
            )}
          </div>
          <span className="absolute -top-1 -right-1 bg-brand-primary text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-base-200 z-20">
            {jobs.length}
          </span>
        </button>
      </div>
    );
  };
  
  const renderExpandedView = () => {
    const clearableJobs = jobs.filter(j => j.status !== 'processing');
    return (
     <div 
        className="w-full max-w-sm"
        onPointerDown={handlePointerDown}
        style={{ touchAction: 'none' }}
    >
      <div className="bg-base-200 rounded-lg shadow-2xl border border-border-color overflow-hidden">
        <header 
          className="p-3 bg-base-300 flex justify-between items-center"
          style={{ cursor: 'grab' }}
        >
          <div className="flex items-center gap-2">
            <button
                onClick={() => onClear(clearableJobs.map(j => j.id))}
                className="p-2 rounded-full text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={lang === 'vi' ? 'Xóa tất cả tác vụ đã hoàn thành' : 'Clear all completed tasks'}
                disabled={clearableJobs.length === 0}
            >
                <TrashIcon className="w-5 h-5" />
            </button>
            <h3 className="font-semibold text-text-main pointer-events-none">{lang === 'vi' ? 'Tác vụ đang chờ' : 'Pending Tasks'}</h3>
          </div>
          <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-full text-text-subtle hover:bg-base-200 hover:text-text-main transition-colors"
              aria-label={lang === 'vi' ? 'Thu nhỏ' : 'Minimize'}
          >
              <ChevronDownIcon className="w-5 h-5" />
          </button>
        </header>
        <ul className="divide-y divide-border-color max-h-64 overflow-y-auto">
          {jobs.map((job) => {
            const isClickable = job.status === 'completed' && job.result;
            // FIX: The wrapper is now always a div to prevent nesting button elements.
            // The onClick handler and ARIA attributes are applied conditionally.
            const wrapperProps: React.HTMLAttributes<HTMLDivElement> & { role?: string } = {
              onClick: isClickable ? () => onCompleteClick(job.result!) : undefined,
              className: `w-full text-left ${isClickable ? 'hover:bg-base-300 transition-colors cursor-pointer' : ''}`,
              role: isClickable ? 'button' : undefined,
              tabIndex: isClickable ? 0 : undefined,
              onKeyDown: isClickable ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onCompleteClick(job.result!) } : undefined,
            };
            
            return (
              <li key={job.id}>
                <div {...wrapperProps}>
                    <div className="p-3 flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <StatusIcon status={job.status} />
                        </div>
                         <div className="flex-grow overflow-hidden flex items-start gap-2">
                            {job.generationMode === 'theory' ? (
                                <BookOpenIcon className="w-5 h-5 mt-0.5 text-brand-secondary flex-shrink-0" />
                            ) : (
                                <FileTypeIcon fileName={job.files[0].name} className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-grow overflow-hidden">
                                <p className="truncate text-sm text-text-main font-medium" title={job.title}>
                                    {job.title}
                                </p>
                                
                                {job.generationMode === 'theory' && job.files.length > 1 && (
                                    <p className="text-xs text-text-subtle">
                                        {job.files.length} {lang === 'vi' ? 'tệp' : 'files'}
                                    </p>
                                )}

                                {job.status === 'error' && (
                                    <p className="text-xs text-red-400 truncate" title={job.error}>
                                        {job.error}
                                    </p>
                                )}
                                {job.status === 'completed' && (
                                    <p className="text-xs text-green-400">
                                        {lang === 'vi' ? 'Sẵn sàng để bắt đầu' : 'Ready to start'}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex-shrink-0">
                          {job.status === 'processing' ? (
                              <button
                              onClick={(e) => { e.stopPropagation(); onCancel(job.id); }}
                              className="p-1 rounded-full text-text-subtle hover:bg-base-300 hover:text-text-main transition-colors"
                              aria-label={lang === 'vi' ? 'Hủy' : 'Cancel'}
                              >
                                  <CloseIcon className="w-4 h-4" />
                              </button>
                          ) : (
                              <button
                              onClick={(e) => { e.stopPropagation(); onClear([job.id]); }}
                              className="p-1 rounded-full text-text-subtle hover:bg-base-300 hover:text-text-main transition-colors"
                              aria-label={lang === 'vi' ? 'Xóa' : 'Clear'}
                              >
                                  <CloseIcon className="w-4 h-4" />
                              </button>
                          )}
                        </div>
                    </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  )};


  return (
    <div
      ref={containerRef}
      style={dynamicStyle}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={`transition-opacity duration-500 ease-in-out ${isHiding ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div key={isMinimized ? 'minimized' : 'expanded'} className="animate-fast-fade-in">
        {isMinimized ? renderMinimizedView() : renderExpandedView()}
      </div>
    </div>
  );
};

export default PendingJobsView;