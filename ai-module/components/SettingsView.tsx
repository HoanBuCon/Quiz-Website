import React, { useState } from 'react';
// FIX: Import ShuffleSettings from the central types file.
import { GeneratedQuiz, QuizConfig, QuizMode, Language, ShuffleSettings } from '../types';
import { BackIcon } from './icons';

interface SettingsViewProps {
  quiz: GeneratedQuiz;
  onStartQuiz: (config: QuizConfig, settings: ShuffleSettings) => void;
  onBack: () => void;
  lang: Language;
}

const ToggleSwitch: React.FC<{
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ label, description, enabled, onChange }) => (
  <label htmlFor={label} className="flex items-center justify-between cursor-pointer bg-base-100 p-4 rounded-lg border border-border-color">
    <div>
        <span className="text-md font-semibold text-text-main">{label}</span>
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

const SettingsView: React.FC<SettingsViewProps> = ({ quiz, onStartQuiz, onBack, lang }) => {
  const [mode, setMode] = useState<QuizMode>('study');
  const [timer, setTimer] = useState({ perQuestion: 60, perComplexQuestion: 2 });
  const [showExplanations, setShowExplanations] = useState(true);
  const [shuffleSettings, setShuffleSettings] = useState<ShuffleSettings>({
    shuffleQuestions: false,
    shuffleOptions: false,
  });

  const handleShuffleChange = (key: keyof ShuffleSettings, value: boolean) => {
    setShuffleSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleTimerChange = (key: keyof typeof timer, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
        setTimer(prev => ({...prev, [key]: numValue}));
    }
  }

  const handleStart = () => {
    onStartQuiz({ mode, timer, showExplanations }, shuffleSettings);
  };
  
  const ModeButton: React.FC<{ currentMode: QuizMode; label: string; description: string }> = ({ currentMode, label, description }) => (
    <button 
        onClick={() => setMode(currentMode)}
        className={`text-left p-4 rounded-lg border-2 w-full transition-all ${mode === currentMode ? 'bg-brand-primary/10 border-brand-primary shadow-md' : 'bg-base-100 border-border-color hover:border-brand-secondary'}`}>
        <h3 className="font-bold text-lg text-text-main">{label}</h3>
        <p className="text-sm text-text-subtle">{description}</p>
    </button>
  );


  return (
    <div className="bg-base-200 p-6 md:p-8 rounded-lg shadow-lg animate-fade-in space-y-8 relative max-w-4xl w-full mx-auto border border-border-color">
       <button onClick={onBack} className="absolute top-4 left-4 flex items-center gap-2 p-2 rounded-lg hover:bg-base-300 transition-colors" aria-label={lang === 'vi' ? 'Quay lại' : 'Go back'}>
            <BackIcon className="w-6 h-6"/>
            <span className="font-semibold text-sm hidden sm:inline">{lang === 'vi' ? 'Quay lại' : 'Back'}</span>
       </button>
      <div className="text-center pt-8">
        <h2 className="text-3xl font-bold mb-2">{lang === 'vi' ? 'Cài đặt Quiz' : 'Quiz Settings'}</h2>
        <p className="text-text-subtle truncate" title={quiz.title}>
            {lang === 'vi' ? 'Chủ đề' : 'Topic'}: <span className="font-semibold text-text-main">{quiz.title}</span> ({quiz.questions.length} {lang === 'vi' ? 'câu hỏi' : 'questions'})
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-xl text-text-main">{lang === 'vi' ? 'Chọn chế độ' : 'Choose a Mode'}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
            <ModeButton 
                currentMode='study' 
                label={lang === 'vi' ? 'Chế độ Học' : 'Study Mode'} 
                description={lang === 'vi' ? 'Nhận phản hồi và giải thích ngay sau mỗi câu. Không tính giờ.' : 'Get instant feedback and explanations after each question. No timer.'}
            />
            <ModeButton 
                currentMode='test' 
                label={lang === 'vi' ? 'Chế độ Thi' : 'Test Mode'} 
                description={lang === 'vi' ? 'Làm bài trong thời gian giới hạn. Kết quả được hiển thị ở cuối.' : 'Take the quiz under timed conditions. Results are shown at the end.'}
            />
        </div>
      </div>
      
      {mode === 'test' && (
        <div className="space-y-4 p-4 bg-base-100 rounded-lg animate-fade-in border border-border-color">
            <h3 className="font-semibold text-xl text-text-main mb-4">{lang === 'vi' ? 'Cài đặt thời gian' : 'Timer Settings'}</h3>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <label htmlFor="perQuestion" className="text-text-main flex-1">{lang === 'vi' ? 'Thời gian mỗi câu (giây)' : 'Time per question (seconds)'}</label>
                <input type="number" id="perQuestion" value={timer.perQuestion} onChange={e => handleTimerChange('perQuestion', e.target.value)}
                    className="bg-base-300 text-text-main p-2 rounded-md w-24 text-center border border-border-color focus:ring-2 focus:ring-brand-primary"/>
            </div>
             <div className="flex flex-col sm:flex-row gap-4 items-center">
                <label htmlFor="perComplex" className="text-text-main flex-1">{lang === 'vi' ? 'Thời gian mỗi câu phức tạp (phút)' : 'Time per complex question (minutes)'}</label>
                <input type="number" id="perComplex" value={timer.perComplexQuestion} onChange={e => handleTimerChange('perComplexQuestion', e.target.value)}
                    className="bg-base-300 text-text-main p-2 rounded-md w-24 text-center border border-border-color focus:ring-2 focus:ring-brand-primary"/>
            </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-semibold text-xl text-text-main">{lang === 'vi' ? 'Tùy chọn' : 'Options'}</h3>
        <ToggleSwitch 
          label={lang === 'vi' ? 'Xáo trộn câu hỏi' : 'Shuffle Questions'}
          enabled={shuffleSettings.shuffleQuestions}
          onChange={(value) => handleShuffleChange('shuffleQuestions', value)}
        />
        <ToggleSwitch 
          label={lang === 'vi' ? 'Xáo trộn đáp án' : 'Shuffle Options'}
          description={lang === 'vi' ? 'Không áp dụng cho câu hỏi Đúng/Sai' : 'Does not apply to True/False questions'}
          enabled={shuffleSettings.shuffleOptions}
          onChange={(value) => handleShuffleChange('shuffleOptions', value)}
        />
        {mode === 'study' && (
           <ToggleSwitch 
            label={lang === 'vi' ? 'Hiển thị giải thích chi tiết' : 'Show detailed explanation'}
            enabled={showExplanations}
            onChange={setShowExplanations}
            />
        )}
      </div>

      <div>
        <button
          onClick={handleStart}
          className="w-full bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-4 rounded-lg transition-colors text-text-inverted text-lg shadow-md hover:shadow-lg"
        >
          {lang === 'vi' ? 'Bắt đầu' : 'Start Quiz'}
        </button>
      </div>
    </div>
  );
};

export default SettingsView;