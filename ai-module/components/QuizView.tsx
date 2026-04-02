import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { GeneratedQuiz, UserAnswers, QuizConfig, QuizQuestion, Language } from '../types';
import { BackIcon, ClockIcon, InfoIcon, CloseIcon, SpinnerIcon, SparklesIcon } from './icons';
import { validateShortAnswer } from '../services/geminiService';
import LatexRenderer from './LatexRenderer';

// --- Question Palette ---
const QuestionPalette: React.FC<{
    count: number;
    currentIndex: number;
    userAnswers: UserAnswers;
    studyResults: (boolean | null)[];
    onSelect: (index: number) => void;
    lang: Language;
}> = ({ count, currentIndex, userAnswers, studyResults, onSelect, lang }) => {
    const paletteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const currentButton = paletteRef.current?.children[currentIndex] as HTMLElement;
        if (currentButton) {
            currentButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [currentIndex]);

    const getStatusClass = (index: number) => {
        if (currentIndex === index) return 'bg-blue-600 text-white border-blue-500'; // Current: Blue
        if (studyResults[index] === true) return 'bg-green-600 text-white border-green-500'; // Correct: Green
        if (studyResults[index] === false) return 'bg-red-600 text-white border-red-500'; // Incorrect: Red
        
        const answer = userAnswers[index];
        const isAnswered = Array.isArray(answer) ? answer.every(a => a !== null) : answer !== null;
        if (isAnswered) return 'bg-base-300 border-border-color'; // Answered but not checked: Grey
        
        return 'bg-base-100 border-border-color'; // Unanswered: White/Default
    };

    return (
        <div ref={paletteRef} className="flex space-x-2 overflow-x-auto pb-3 mb-4 scrollbar-thin">
            {Array.from({ length: count }, (_, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(i)}
                    className={`w-10 h-10 flex-shrink-0 rounded-md font-semibold text-sm border transition-colors ${getStatusClass(i)}`}
                    aria-label={`${lang === 'vi' ? 'Đi đến câu hỏi' : 'Go to question'} ${i + 1}`}
                    aria-current={currentIndex === i ? 'step' : undefined}
                >
                    {i + 1}
                </button>
            ))}
        </div>
    );
};


// --- Reusable Timer Component ---
const Timer: React.FC<{ initialTime: number; onTimeUp: () => void; onTick: (time: number) => void }> = ({ initialTime, onTimeUp, onTick }) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onTimeUp();
          return 0;
        }
        onTick(prev - 1);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [onTimeUp, onTick]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="flex items-center gap-2 text-text-subtle font-mono" aria-label={`Time left: ${minutes} minutes and ${seconds} seconds`}>
      <ClockIcon className="w-5 h-5" />
      <span>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
    </div>
  );
};

// --- Reusable Study Mode Feedback Component ---
const StudyFeedback: React.FC<{ question: QuizQuestion; isCorrect: boolean; showExplanation: boolean; lang: Language; additionalFeedback?: string | null; }> = ({ question, isCorrect, showExplanation, lang, additionalFeedback }) => (
    <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}}>
        <div className="flex items-center gap-2">
            <InfoIcon className={`w-6 h-6 flex-shrink-0 ${isCorrect ? 'text-green-400' : 'text-red-400'}`} />
            <h3 className={`text-xl font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {isCorrect ? (lang === 'vi' ? 'Chính xác!' : 'Correct!') : (lang === 'vi' ? 'Không chính xác' : 'Incorrect')}
            </h3>
        </div>
        {additionalFeedback && (
             <p className="text-blue-300 mt-2 text-base font-semibold">
                <span className="whitespace-pre-wrap">{additionalFeedback}</span>
            </p>
        )}
        {!isCorrect && question.type === 'multiple-choice' && (
            <p className="text-text-main mt-2">{lang === 'vi' ? 'Đáp án đúng là: ' : 'The correct answer is: '} <strong className="font-semibold text-text-main whitespace-pre-wrap"><LatexRenderer text={question.answer}/></strong></p>
        )}
         {!isCorrect && question.type === 'short-answer' && (
             <p className="text-text-main mt-2">{lang === 'vi' ? 'Đáp án đúng là: ' : 'The correct answer is: '} <strong className="font-semibold text-text-main whitespace-pre-wrap"><LatexRenderer text={question.answer}/></strong></p>
        )}
        {showExplanation && <div className="text-text-subtle mt-3 text-base"><LatexRenderer text={question.explanation} /></div>}
    </div>
);


interface QuizViewProps {
  quiz: GeneratedQuiz;
  config: QuizConfig;
  onQuizFinish: (answers: UserAnswers, duration: number, smartCheckOutcomes: Record<number, boolean>) => void;
  onSaveAndExit: (answers: UserAnswers, duration: number, smartCheckOutcomes: Record<number, boolean>) => void;
  onBack: () => void;
  initialDuration?: number;
  initialAnswers?: UserAnswers;
  lang: Language;
  setZoomedImageUrl: (url: string | null) => void;
}

const QuizView: React.FC<QuizViewProps> = ({ quiz, config, onQuizFinish, onSaveAndExit, onBack, initialDuration = 0, initialAnswers, lang, setZoomedImageUrl }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>(() => 
    initialAnswers && initialAnswers.length === quiz.questions.length ? initialAnswers :
    quiz.questions.map(q => q.type === 'multi-true-false' && q.subQuestions ? Array(q.subQuestions.length).fill(null) : null)
  );
  const [startTime] = useState(Date.now());
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [studyResults, setStudyResults] = useState<(boolean | null)[]>(() => Array(quiz.questions.length).fill(null));
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
  const [shortAnswerFeedback, setShortAnswerFeedback] = useState<Record<number, string | null>>({});
  const [smartCheckOutcomes, setSmartCheckOutcomes] = useState<Record<number, boolean>>({});
  const [isSmartCheckEnabled, setIsSmartCheckEnabled] = useState(true);

  const isAnswered = useMemo(() => {
    return config.mode === 'study' && studyResults[currentQuestionIndex] !== null;
  }, [config.mode, studyResults, currentQuestionIndex]);

  const totalTime = useMemo(() => {
    if (config.mode === 'study') return 0;
    return quiz.questions.reduce((total, q) => {
        if (q.type === 'multi-true-false') {
            return total + config.timer.perComplexQuestion * 60;
        }
        return total + config.timer.perQuestion;
    }, 0);
  }, [quiz, config]);

  const currentQuestion = useMemo(() => quiz.questions[currentQuestionIndex], [quiz.questions, currentQuestionIndex]);
  const currentUserAnswer = userAnswers[currentQuestionIndex];

  const getCurrentDuration = useCallback(() => {
      if (config.mode === 'test') {
          return timeElapsed;
      }
      // For study mode, calculate from start time
      return Math.floor((Date.now() - startTime) / 1000);
  }, [config.mode, timeElapsed, startTime]);

  const finishQuiz = useCallback(() => {
    const finalDuration = initialDuration + getCurrentDuration();
    onQuizFinish(userAnswers, finalDuration, smartCheckOutcomes);
  }, [userAnswers, onQuizFinish, initialDuration, getCurrentDuration, smartCheckOutcomes]);
  
  const isStudyCorrect = useMemo(() => {
    if (config.mode !== 'study' || !isAnswered) return false;
    // The source of truth for correctness is the studyResults state array
    return studyResults[currentQuestionIndex] === true;
  }, [config.mode, isAnswered, studyResults, currentQuestionIndex]);
  
  const isMultiPartFullyAnswered = useMemo(() => {
    if (currentQuestion.type !== 'multi-true-false' || !currentQuestion.subQuestions) return false;
    const ans = currentUserAnswer as any[];
    return Array.isArray(ans) && ans.length === currentQuestion.subQuestions.length && ans.every(a => a !== null);
  }, [currentUserAnswer, currentQuestion]);
  
  const handleOptionSelect = (option: string) => {
    if (isAnswered) return;
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = option;
    setUserAnswers(newAnswers);
    if (config.mode === 'study') {
        const isCorrectNow = option === currentQuestion.answer;
        setStudyResults(prev => {
            const newResults = [...prev];
            newResults[currentQuestionIndex] = isCorrectNow;
            return newResults;
        });
    }
  };

  const handleShortAnswerChange = (text: string) => {
    if (isAnswered) return;
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = text;
    setUserAnswers(newAnswers);
  };
  
  const handleSubQuestionSelect = (subIndex: number, choice: 'True' | 'False') => {
    if (isAnswered) return;
    const newAnswers = [...userAnswers];
    let currentSubAnswers = Array.isArray(newAnswers[currentQuestionIndex]) 
        ? [...newAnswers[currentQuestionIndex] as ('True'|'False'|null)[]] 
        : Array(currentQuestion.subQuestions?.length).fill(null);
    
    currentSubAnswers[subIndex] = choice;
    newAnswers[currentQuestionIndex] = currentSubAnswers;
    setUserAnswers(newAnswers);
  };

  const handleCheckTfAnswer = () => {
      if (isMultiPartFullyAnswered) {
          const userSubAnswers = currentUserAnswer as ('True' | 'False')[];
          const isCorrectNow = currentQuestion.subQuestions!.every((sub, subIndex) => userSubAnswers?.[subIndex] === sub.answer);
          setStudyResults(prev => {
              const newResults = [...prev];
              newResults[currentQuestionIndex] = isCorrectNow;
              return newResults;
          });
      }
  }

  const handleCheckShortAnswer = async () => {
    if (currentQuestion.type !== 'short-answer' || !currentUserAnswer) return;
    
    setShortAnswerFeedback(prev => ({ ...prev, [currentQuestionIndex]: null }));

    if (isSmartCheckEnabled) {
        setIsCheckingAnswer(true);
        try {
            const result = await validateShortAnswer(
                currentUserAnswer as string,
                currentQuestion.answer as string,
                currentQuestion.question,
                lang
            );
            
            setSmartCheckOutcomes(prev => ({ ...prev, [currentQuestionIndex]: result.isCorrect }));
            setStudyResults(prev => {
                const newResults = [...prev];
                newResults[currentQuestionIndex] = result.isCorrect;
                return newResults;
            });

            if (result.feedback) {
                 setShortAnswerFeedback(prev => ({ ...prev, [currentQuestionIndex]: result.feedback }));
            }
            
        } catch (error) {
            console.error(error);
            setStudyResults(prev => {
                const newResults = [...prev];
                newResults[currentQuestionIndex] = false; // Default to incorrect on API error
                return newResults;
            });
            setShortAnswerFeedback(prev => ({ ...prev, [currentQuestionIndex]: lang === 'vi' ? 'Lỗi khi kiểm tra đáp án.' : 'Error checking answer.' }));
        } finally {
            setIsCheckingAnswer(false);
        }
    } else {
        // Simple local check for study mode when smart check is OFF
        const userAnswer = (currentUserAnswer as string).trim().toLowerCase().replace(/,/g, '.');
        const correctAnswer = (currentQuestion.answer as string).trim().toLowerCase().replace(/,/g, '.');
        const isCorrect = userAnswer === correctAnswer;
        
        setStudyResults(prev => {
            const newResults = [...prev];
            newResults[currentQuestionIndex] = isCorrect;
            return newResults;
        });
    }
  };

  const handleCheckAnswer = () => {
    if (currentQuestion.type === 'multi-true-false') {
        handleCheckTfAnswer();
    } else if (currentQuestion.type === 'short-answer') {
        handleCheckShortAnswer();
    }
  };

  const goToQuestion = useCallback((index: number) => {
      if (index < 0 || index >= quiz.questions.length || index === currentQuestionIndex) return;
      
      setIsTransitioning(true); // Start fade out
      
      setTimeout(() => {
        setCurrentQuestionIndex(index);
        setIsTransitioning(false); // Trigger fade in after state update
      }, 150); // This duration is for the fade-out effect
  }, [currentQuestionIndex, quiz.questions.length]);

  const handleNext = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    } else {
      finishQuiz();
    }
  };
  
  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      goToQuestion(currentQuestionIndex - 1);
    }
  };

  const handleSaveAndExitClick = () => {
    const finalDuration = initialDuration + getCurrentDuration();
    onSaveAndExit(userAnswers, finalDuration, smartCheckOutcomes);
  };

  const getButtonClass = (option: string) => {
    if (config.mode === 'test') {
        if(currentUserAnswer === option) return 'bg-brand-secondary ring-2 ring-brand-primary';
        return 'bg-base-300 hover:bg-base-300-hover';
    }
    // Study Mode
    if (!isAnswered) {
      return 'bg-base-300 hover:bg-base-300-hover';
    }
    if (option === currentQuestion.answer) {
      return 'bg-green-700/80 ring-2 ring-green-500 text-text-inverted';
    }
    if (option === currentUserAnswer) {
      return 'bg-red-700/80 ring-2 ring-red-500 text-text-inverted';
    }
    return 'bg-base-300 opacity-50 cursor-not-allowed';
  };

  const renderQuestionBody = () => {
    if (currentQuestion.type === 'multiple-choice' && currentQuestion.options) {
      return (
        <div className="space-y-4" role="group" aria-labelledby="question-title">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionSelect(option)}
              disabled={isAnswered}
              className={`w-full text-left p-4 rounded-lg transition-all duration-200 text-text-main ${getButtonClass(option)}`}
              aria-pressed={currentUserAnswer === option}
            >
              <span className="whitespace-pre-wrap">{option}</span>
            </button>
          ))}
        </div>
      );
    }

    if (currentQuestion.type === 'multi-true-false' && currentQuestion.subQuestions) {
        const currentSubAnswers = (currentUserAnswer as ('True' | 'False' | null)[]) || [];
      return (
        <div className="space-y-4" role="group" aria-labelledby="question-title">
          {currentQuestion.subQuestions.map((sub, index) => {
             const getSubButtonClass = (choice: 'True' | 'False') => {
                if (config.mode === 'test' || !isAnswered) {
                    return currentSubAnswers[index] === choice ? 'bg-brand-secondary text-text-inverted' : 'bg-base-100 hover:bg-base-300-hover';
                }
                // Study mode - after checking answer
                const isCorrectChoice = choice === sub.answer;
                const isUserChoice = choice === currentSubAnswers[index];
                if (isCorrectChoice) return 'bg-green-700/80 text-text-inverted';
                if (isUserChoice) return 'bg-red-700/80 text-text-inverted';
                return 'bg-base-100 opacity-50';
             }

            return (
            <div key={index} className="p-4 bg-base-300 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex-1 text-text-main text-left whitespace-pre-wrap">{sub.statement}</div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleSubQuestionSelect(index, 'True')}
                  disabled={isAnswered}
                  className={`px-6 py-2 rounded-md font-semibold transition-colors ${getSubButtonClass('True')}`}
                >{lang === 'vi' ? 'Đúng' : 'True'}</button>
                <button
                  onClick={() => handleSubQuestionSelect(index, 'False')}
                  disabled={isAnswered}
                  className={`px-6 py-2 rounded-md font-semibold transition-colors ${getSubButtonClass('False')}`}
                >{lang === 'vi' ? 'Sai' : 'False'}</button>
              </div>
            </div>
          )})}
        </div>
      );
    }

    if (currentQuestion.type === 'short-answer') {
      return (
        <div>
          <input
            type="text"
            value={(currentUserAnswer as string) || ''}
            onChange={(e) => handleShortAnswerChange(e.target.value)}
            disabled={isAnswered}
            className="w-full bg-base-300 p-4 rounded-lg text-text-main border border-border-color focus:ring-2 focus:ring-brand-primary focus:outline-none disabled:opacity-70"
            placeholder={lang === 'vi' ? 'Nhập câu trả lời của bạn...' : 'Enter your answer...'}
            aria-labelledby="question-title"
          />
           {config.mode === 'study' && (
            <div className="mt-4">
                <label className={`flex items-center gap-3 p-3 rounded-lg bg-base-100 transition-colors ${isAnswered ? 'cursor-not-allowed opacity-70' : 'hover:bg-base-300/50 cursor-pointer'}`}>
                    <input
                        type="checkbox"
                        checked={isSmartCheckEnabled}
                        onChange={(e) => setIsSmartCheckEnabled(e.target.checked)}
                        disabled={isAnswered}
                        className="form-checkbox h-5 w-5 rounded text-brand-primary bg-base-300 border-border-color focus:ring-brand-secondary flex-shrink-0"
                    />
                    <div>
                        <span className="font-semibold text-text-main text-sm flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4 text-brand-secondary"/>
                            {lang === 'vi' ? 'Chấm bài thông minh' : 'Smart Checking'}
                        </span>
                        <p className="text-xs text-text-subtle">{lang === 'vi' ? 'AI sẽ hiểu các câu trả lời tương tự và đưa ra phản hồi.' : 'AI will understand similar answers and provide feedback.'}</p>
                    </div>
                </label>
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };
  
  const showCheckButton = config.mode === 'study' && !isAnswered && (
    (currentQuestion.type === 'multi-true-false' && isMultiPartFullyAnswered) ||
    (currentQuestion.type === 'short-answer' && currentUserAnswer && (currentUserAnswer as string).trim() !== '')
  );

  return (
    <>
      <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg relative max-w-4xl w-full mx-auto">
        <div className="flex justify-between items-center mb-4">
            <button onClick={() => setIsExitModalOpen(true)} className="flex items-center gap-2 p-2 -ml-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Thoát' : 'Exit'}>
                <CloseIcon className="w-6 h-6"/>
                <span className="font-semibold">{lang === 'vi' ? 'Thoát' : 'Exit'}</span>
            </button>
            {config.mode === 'test' && totalTime > 0 ? (
                <Timer initialTime={totalTime - initialDuration} onTimeUp={finishQuiz} onTick={(time) => setTimeElapsed(totalTime - time)} />
            ) : (
            <span className="font-semibold text-brand-secondary">{lang === 'vi' ? 'Chế độ Học' : 'Study Mode'}</span>
            )}
        </div>

        <QuestionPalette 
            lang={lang}
            count={quiz.questions.length}
            currentIndex={currentQuestionIndex}
            userAnswers={userAnswers}
            studyResults={studyResults}
            onSelect={goToQuestion}
        />
        
        <div className={`transition-opacity duration-150 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <div key={currentQuestionIndex}>
                 <div className={`flex flex-col ${(currentQuestion.passage && currentQuestion.passage.trim() !== '') ? 'md:flex-row md:gap-6' : ''}`}>
                    {(currentQuestion.passage && currentQuestion.passage.trim() !== '') && (
                        <div className="md:w-1/2 mb-6 md:mb-0 animate-fast-fade-in">
                            <h3 className="text-lg font-semibold mb-2 text-text-subtle">{lang === 'vi' ? 'Đoạn văn tham khảo' : 'Reference Passage'}</h3>
                            <div className="bg-base-100 p-4 rounded-lg max-h-[60vh] overflow-y-auto text-text-subtle text-base whitespace-pre-wrap">
                                {currentQuestion.passage}
                            </div>
                        </div>
                    )}

                    <div className={`${(currentQuestion.passage && currentQuestion.passage.trim() !== '') ? 'md:w-1/2' : 'w-full'}`}>
                        {currentQuestion.audio && (
                            <div className="mb-6">
                                <audio controls src={currentQuestion.audio} className="w-full" />
                            </div>
                        )}
                        {currentQuestion.image && (
                        <div className="mb-6 rounded-lg overflow-hidden bg-base-100 flex justify-center p-2">
                            <img src={currentQuestion.image} alt={lang === 'vi' ? 'Bối cảnh câu hỏi' : 'Question context'} className="max-h-96 w-auto object-contain cursor-pointer" onClick={() => setZoomedImageUrl(currentQuestion.image!)}/>
                        </div>
                        )}
                        <h2 id="question-title" className="text-2xl font-semibold mb-6 text-text-main min-h-[56px] whitespace-pre-wrap">{`${currentQuestionIndex + 1}. ${currentQuestion.question}`}</h2>
                        
                        {renderQuestionBody()}
                    </div>
                </div>

                {showCheckButton && (
                    <div className="mt-8">
                        <button 
                          onClick={handleCheckAnswer}
                          disabled={isCheckingAnswer}
                          className="w-full bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-4 rounded-lg transition-colors text-text-inverted flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                           {isCheckingAnswer && <SpinnerIcon className="w-5 h-5 animate-spin" />}
                           {lang === 'vi' ? 'Kiểm tra' : 'Check'}
                        </button>
                    </div>
                )}
                
                {config.mode === 'study' && isAnswered && (
                    <StudyFeedback 
                        question={currentQuestion}
                        isCorrect={isStudyCorrect}
                        showExplanation={config.showExplanations}
                        lang={lang}
                        additionalFeedback={shortAnswerFeedback[currentQuestionIndex]}
                    />
                )}
                
                <div className="mt-8 flex justify-between items-center">
                    <button onClick={handleBack} disabled={currentQuestionIndex === 0} className="px-6 py-2 rounded-lg bg-base-300 hover:bg-base-300-hover font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {lang === 'vi' ? 'Quay lại' : 'Back'}
                    </button>
                    
                    {currentQuestionIndex === quiz.questions.length - 1 ? (
                        <button onClick={finishQuiz} className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 font-semibold transition-colors text-white">
                            {lang === 'vi' ? 'Nộp bài' : 'Finish Quiz'}
                        </button>
                    ) : (
                        <button onClick={handleNext} className="px-6 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover font-semibold transition-colors text-text-inverted">
                            {lang === 'vi' ? 'Câu tiếp theo' : 'Next Question'}
                        </button>
                    )}
                </div>
            </div>
        </div>
      </div>
      {isExitModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in">
                <h3 className="text-xl font-bold mb-4">{lang === 'vi' ? 'Bạn có chắc chắn muốn thoát?' : 'Are you sure you want to exit?'}</h3>
                <p className="text-text-subtle mb-6">{lang === 'vi' ? 'Tiến trình của bạn sẽ được lưu để bạn có thể tiếp tục sau.' : 'Your progress will be saved so you can resume later.'}</p>
                <div className="flex flex-col gap-3">
                    <button onClick={handleSaveAndExitClick} className="w-full text-left p-3 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Lưu và Thoát' : 'Save and Exit'}
                    </button>
                     <button onClick={onBack} className="w-full text-left p-3 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold text-red-400">
                        {lang === 'vi' ? 'Thoát mà không lưu' : 'Exit Without Saving'}
                    </button>
                    <button onClick={() => setIsExitModalOpen(false)} className="w-full text-left p-3 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Ở lại' : 'Stay'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </>
  );
};

// FIX: Add default export to the component
export default QuizView;