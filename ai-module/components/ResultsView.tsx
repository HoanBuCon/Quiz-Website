import React, { useMemo, useState } from 'react';
import { QuizQuestion, UserAnswers, Language, QuizAttempt } from '../types';
import { InfoIcon } from './icons';
import LatexRenderer from './LatexRenderer';

interface ResultsViewProps {
  questions: QuizQuestion[];
  attempt: QuizAttempt;
  onGoHome: () => void;
  onRetake: () => void;
  onDeleteAttemptAndExit: (attemptId: string) => void;
  isReview: boolean;
  lang: Language;
  setZoomedImageUrl: (url: string | null) => void;
}

const ResultsView: React.FC<ResultsViewProps> = ({ questions, attempt, onGoHome, onRetake, onDeleteAttemptAndExit, isReview, lang, setZoomedImageUrl }) => {
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);
  const { userAnswers, smartCheckOutcomes } = attempt;

  const { score, totalQuestions, percentage } = useMemo(() => {
    const totalQuestions = questions.length;
    let score = 0;

    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      if (question.type === 'multiple-choice') {
        if (userAnswer === question.answer) {
          score++;
        }
      } else if (question.type === 'multi-true-false' && question.subQuestions) {
        const userSubAnswers = userAnswer as ('True' | 'False')[];
        const isCompletelyCorrect = question.subQuestions.every(
          (sub, subIndex) => userSubAnswers?.[subIndex] === sub.answer
        );
        if (isCompletelyCorrect) {
          score++;
        }
      } else if (question.type === 'short-answer') {
        const smartResult = smartCheckOutcomes?.[index];
        if (typeof smartResult === 'boolean') {
            if (smartResult) score++;
        } else {
            if (typeof userAnswer === 'string' && typeof question.answer === 'string' && userAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase()) {
                score++;
            }
        }
      }
    });
    
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    return { score, totalQuestions, percentage };
  }, [questions, userAnswers, smartCheckOutcomes]);
  
  let feedback = { message: lang === 'vi' ? "Làm tốt lắm!" : "Great job!", color: "text-green-400" };
  if (percentage < 50) {
    feedback = { message: lang === 'vi' ? "Hãy tiếp tục luyện tập!" : "Keep practicing!", color: "text-red-400" };
  } else if (percentage < 80) {
    feedback = { message: lang === 'vi' ? "Cố gắng tốt!" : "Good effort!", color: "text-yellow-400" };
  }

  const renderAnswerReview = (question: QuizQuestion, index: number) => {
    const userAnswer = userAnswers[index];
    
    const renderMcReview = () => {
      if (!question.options) return null;
      const getOptionClass = (option: string) => {
        if (option === question.answer) return 'bg-green-500/30 border-green-500'; // Correct
        if (option === userAnswer) return 'bg-red-500/30 border-red-500'; // User's incorrect
        return 'bg-base-300/50 border-transparent';
      };
      return (
        <div className="space-y-2">
          {question.options.map((option, optIndex) => (
            <div key={optIndex} className={`p-3 rounded-md border text-sm whitespace-pre-wrap ${getOptionClass(option)}`}>
              {option}
            </div>
          ))}
        </div>
      );
    };
    
    const renderMtfReview = () => {
      if (!question.subQuestions) return null;
      const userSubAnswers = userAnswer as ('True' | 'False' | null)[];
      return (
        <div className="space-y-3">
          {question.subQuestions.map((sub, subIndex) => {
            const userChoice = userSubAnswers?.[subIndex];
            const isSubCorrect = userChoice === sub.answer;
            const localizedAnswer = lang === 'vi' ? (sub.answer === 'True' ? 'Đúng' : 'Sai') : sub.answer;
            return (
              <div key={subIndex} className="p-3 bg-base-300/50 rounded-md">
                <p className="text-text-subtle mb-2 whitespace-pre-wrap">{sub.statement}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className={`font-semibold ${isSubCorrect ? 'text-green-400' : 'text-red-400'}`}>
                    {lang === 'vi' ? 'Câu trả lời của bạn: ' : 'Your Answer: '} {userChoice || (lang === 'vi' ? 'Chưa trả lời' : 'Not Answered')}
                  </span>
                  {!isSubCorrect && (
                     <span className="text-text-subtle">{lang === 'vi' ? 'Đáp án đúng: ' : 'Correct Answer: '} <LatexRenderer text={localizedAnswer} /></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const renderSaReview = () => {
        const answer = userAnswer as string;
        const smartCheckResult = attempt.smartCheckOutcomes?.[index];
        let isCorrect: boolean;

        if (typeof smartCheckResult === 'boolean') {
            isCorrect = smartCheckResult;
        } else {
            isCorrect = typeof answer === 'string' && typeof question.answer === 'string' && answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
        }

        return (
            <div className="space-y-2">
                <div className={`p-3 rounded-md border text-sm ${isCorrect ? 'bg-green-500/30 border-green-500' : 'bg-red-500/30 border-red-500'}`}>
                    <p className="text-xs text-text-subtle mb-1">{lang === 'vi' ? 'Câu trả lời của bạn' : 'Your Answer'}</p>
                    <p className="whitespace-pre-wrap">{answer || (lang === 'vi' ? 'Chưa trả lời' : 'Not Answered')}</p>
                </div>
                {!isCorrect && (
                    <div className="p-3 rounded-md bg-base-300/50 border border-transparent">
                        <p className="text-xs text-text-subtle mb-1">{lang === 'vi' ? 'Đáp án đúng' : 'Correct Answer'}</p>
                        <p className="whitespace-pre-wrap"><LatexRenderer text={question.answer} /></p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            {question.type === 'multiple-choice' && renderMcReview()}
            {question.type === 'multi-true-false' && renderMtfReview()}
            {question.type === 'short-answer' && renderSaReview()}
            <div className="mt-4 p-3 rounded-lg bg-base-300/40">
                <div className="flex items-center gap-2">
                    <InfoIcon className="w-5 h-5 flex-shrink-0 text-brand-secondary" />
                    <h4 className="font-semibold text-brand-secondary">{lang === 'vi' ? 'Giải thích' : 'Explanation'}</h4>
                </div>
                <div className="text-text-subtle mt-2 text-sm">
                    <LatexRenderer text={question.explanation} />
                </div>
            </div>
        </>
    )
  }

  return (
    <>
    <div className="space-y-8 max-w-4xl w-full mx-auto">
      <div className="bg-base-200 p-8 rounded-lg shadow-lg text-center animate-fade-in">
        <h2 className="text-3xl font-bold mb-2">{isReview ? (lang === 'vi' ? 'Xem lại bài làm' : "Reviewing Past Attempt") : (lang === 'vi' ? 'Hoàn thành!' : "Quiz Complete!")}</h2>
        <p className="text-text-subtle mb-6">{isReview ? (lang === 'vi' ? 'Đây là kết quả của bạn:' : "Here's how you did on this attempt:") : (lang === 'vi' ? 'Đây là kết quả của bạn:' : "Here's how you did:")}</p>
        <div className="mb-6">
          <p className={`text-5xl font-bold ${feedback.color} animate-fade-in`} style={{ animationDelay: '0.2s' }}>{percentage}%</p>
          <p className="text-text-subtle mt-2 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {lang === 'vi' 
                ? <>Bạn đã trả lời đúng <span className="font-bold">{score}</span> trên <span className="font-bold">{totalQuestions}</span> câu hỏi.</>
                : <>You answered <span className="font-bold">{score}</span> out of <span className="font-bold">{totalQuestions}</span> questions correctly.</>
            }
          </p>
        </div>
        {!isReview && <p className={`text-xl mb-8 ${feedback.color} animate-fade-in`} style={{ animationDelay: '0.6s' }}>{feedback.message}</p>}
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '0.8s' }}>
          <button
            onClick={() => setIsHomeModalOpen(true)}
            className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-6 rounded-lg transition-colors text-text-inverted"
          >
            {isReview ? (lang === 'vi' ? 'Về trang chủ' : "Back to Main") : (lang === 'vi' ? 'Về trang chủ' : "Back to Main")}
          </button>
           <button 
            onClick={onRetake} 
            className="w-full sm:w-auto bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors"
          >
            {lang === 'vi' ? 'Làm bài lại' : 'Retake Quiz'}
          </button>
        </div>
      </div>

      <div className="bg-base-200 p-8 rounded-lg shadow-lg animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-2xl font-bold mb-6 text-center">{lang === 'vi' ? 'Xem lại câu trả lời' : 'Review Your Answers'}</h3>
        <div className="space-y-6">
          {questions.map((question, index) => (
            <div key={index} className="border-b border-base-300 pb-6 last:border-b-0">
               {(question.passage && question.passage.trim() !== '') && (
                    <div className="mb-4">
                        <h4 className="font-semibold text-text-main mb-2">{lang === 'vi' ? 'Đoạn văn đã cho' : 'Given Passage'}</h4>
                        <div className="bg-base-100 p-3 rounded-lg text-sm text-text-subtle whitespace-pre-wrap">
                            {question.passage}
                        </div>
                    </div>
                )}
               {question.audio && (
                    <div className="mb-4">
                        <audio controls src={question.audio} className="w-full" />
                    </div>
                )}
               {question.image && (
                <div className="mb-4 rounded-lg overflow-hidden bg-base-100 flex justify-center p-2">
                    <img src={question.image} alt={lang === 'vi' ? 'Bối cảnh câu hỏi' : 'Question context'} className="max-h-96 w-auto object-contain cursor-pointer" onClick={() => setZoomedImageUrl(question.image!)}/>
                </div>
              )}
              <div className="font-semibold text-lg text-text-main mb-4 whitespace-pre-wrap">{`${index + 1}. ${question.question}`}</div>
              {renderAnswerReview(question, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
    {isHomeModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-base-200 p-6 rounded-lg shadow-xl w-full max-w-sm m-4 animate-scale-in">
                <h3 className="text-xl font-bold mb-4">{lang === 'vi' ? 'Về Trang chủ?' : 'Go to Main Menu?'}</h3>
                <p className="text-text-subtle mb-6">{lang === 'vi' ? 'Kết quả của bạn đã được lưu.' : 'Your results have been saved.'}</p>
                <div className="flex flex-col gap-3">
                    <button onClick={onGoHome} className="w-full text-left p-3 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Lưu và Thoát' : 'Save and Exit'}
                    </button>
                    {!isReview && (
                        <button onClick={() => onDeleteAttemptAndExit(attempt.id)} className="w-full text-left p-3 bg-base-300 hover:bg-base-300-hover rounded-md transition-colors font-semibold text-red-400">
                            {lang === 'vi' ? 'Không lưu và Thoát' : "Don't Save and Exit"}
                        </button>
                    )}
                    <button onClick={() => setIsHomeModalOpen(false)} className="w-full text-left p-3 bg-brand-primary hover:bg-brand-primary-hover text-text-inverted rounded-md transition-colors font-semibold">
                        {lang === 'vi' ? 'Tiếp tục' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default ResultsView;