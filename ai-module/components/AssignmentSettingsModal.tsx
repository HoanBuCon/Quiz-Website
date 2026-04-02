import React, { useState } from 'react';
import { GeneratedQuiz, QuizConfig, QuizMode, Language, ShuffleSettings } from '../types';

interface AssignmentSettingsModalProps {
  quiz: GeneratedQuiz;
  onAssign: (config: QuizConfig, shuffleSettings: ShuffleSettings, durationMinutes: number | null) => void;
  onClose: () => void;
  lang: Language;
}

type DurationOption = '30' | '60' | 'permanent' | 'custom';

const ToggleSwitch: React.FC<{
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ label, description, enabled, onChange }) => (
  <label htmlFor={'assign-' + label} className="flex items-center justify-between cursor-pointer bg-base-300 p-3 rounded-lg">
    <div>
        <span className="font-semibold text-text-main">{label}</span>
        {description && <p className="text-sm text-text-subtle">{description}</p>}
    </div>
    <div className="relative flex-shrink-0">
      <input 
        id={'assign-' + label}
        type="checkbox" 
        className="sr-only" 
        checked={enabled} 
        onChange={(e) => onChange(e.target.checked)} 
      />
      <div className={`block w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-brand-primary' : 'bg-base-100'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform ${enabled ? 'transform translate-x-5' : ''}`}></div>
    </div>
  </label>
);

const AssignmentSettingsModal: React.FC<AssignmentSettingsModalProps> = ({ quiz, onAssign, onClose, lang }) => {
  const [mode, setMode] = useState<QuizMode>('test');
  const [timer, setTimer] = useState({ perQuestion: 60, perComplexQuestion: 2 });
  const [showExplanations, setShowExplanations] = useState(true);
  const [shuffleSettings, setShuffleSettings] = useState<ShuffleSettings>({
    shuffleQuestions: true,
    shuffleOptions: true,
  });
  const [durationOption, setDurationOption] = useState<DurationOption>('permanent');
  const [customDuration, setCustomDuration] = useState(120);

  const handleShuffleChange = (key: keyof ShuffleSettings, value: boolean) => {
    setShuffleSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleAssignClick = () => {
    const config: QuizConfig = { mode, timer, showExplanations };
    let durationMinutes: number | null = null;
    if (durationOption === '30') durationMinutes = 30;
    else if (durationOption === '60') durationMinutes = 60;
    else if (durationOption === 'custom') durationMinutes = customDuration;
    
    onAssign(config, shuffleSettings, durationMinutes);
  };

  const ModeButton: React.FC<{ currentMode: QuizMode; label: string; description: string }> = ({ currentMode, label, description }) => (
    <button 
        onClick={() => setMode(currentMode)}
        className={`text-left p-3 rounded-lg border-2 w-full transition-all ${mode === currentMode ? 'bg-brand-primary/20 border-brand-primary' : 'bg-base-300 border-transparent hover:border-border-color'}`}>
        <h3 className="font-bold text-md text-text-main">{label}</h3>
        <p className="text-xs text-text-subtle">{description}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" role="dialog" aria-modal="true">
        <div className="bg-base-200 p-6 rounded-lg shadow-2xl w-full max-w-md m-4 animate-scale-in space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center">{lang === 'vi' ? 'Giao bài tập' : 'Assign Homework'}</h2>
            
            <div className="space-y-2">
                <h3 className="font-semibold text-text-main">{lang === 'vi' ? '1. Thời hạn' : '1. Deadline'}</h3>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(['30', '60', 'permanent', 'custom'] as DurationOption[]).map(opt => (
                        <button key={opt} onClick={() => setDurationOption(opt)} className={`px-2 py-2 text-sm rounded-md font-semibold ${durationOption === opt ? 'bg-brand-secondary text-white' : 'bg-base-300 hover:bg-base-300-hover'}`}>
                          {{
                            '30': '30 ' + (lang === 'vi' ? 'Phút' : 'Mins'),
                            '60': '1 ' + (lang === 'vi' ? 'Giờ' : 'Hour'),
                            'permanent': lang === 'vi' ? 'Vĩnh viễn' : 'Permanent',
                            'custom': lang === 'vi' ? 'Tùy chỉnh' : 'Custom',
                          }[opt]}
                        </button>
                    ))}
                 </div>
                 {durationOption === 'custom' && (
                    <div className="flex items-center gap-2 p-2 bg-base-100 rounded-md animate-fade-in">
                        <input 
                            type="number"
                            value={customDuration}
                            onChange={(e) => setCustomDuration(parseInt(e.target.value) || 0)}
                            className="w-full bg-base-300 p-2 rounded-md"
                        />
                        <span className="font-semibold">{lang === 'vi' ? 'phút' : 'minutes'}</span>
                    </div>
                 )}
            </div>

            <div className="space-y-2">
                <h3 className="font-semibold text-text-main">{lang === 'vi' ? '2. Chế độ làm bài' : '2. Quiz Mode'}</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                    <ModeButton currentMode='test' label={lang === 'vi' ? 'Chế độ Thi' : 'Test Mode'} description={lang === 'vi' ? 'Tính giờ & xem điểm cuối cùng.' : 'Timed & scored at the end.'}/>
                    <ModeButton currentMode='study' label={lang === 'vi' ? 'Chế độ Học' : 'Study Mode'} description={lang === 'vi' ? 'Xem giải thích sau mỗi câu.' : 'Instant feedback.'}/>
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="font-semibold text-text-main">{lang === 'vi' ? '3. Tùy chọn' : '3. Options'}</h3>
                <ToggleSwitch 
                  label={lang === 'vi' ? 'Xáo trộn câu hỏi' : 'Shuffle Questions'}
                  enabled={shuffleSettings.shuffleQuestions}
                  onChange={(value) => handleShuffleChange('shuffleQuestions', value)}
                />
                <ToggleSwitch 
                  label={lang === 'vi' ? 'Xáo trộn đáp án' : 'Shuffle Options'}
                  enabled={shuffleSettings.shuffleOptions}
                  onChange={(value) => handleShuffleChange('shuffleOptions', value)}
                />
            </div>
            
            <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2 border-t border-border-color">
                <button onClick={handleAssignClick} className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary-hover font-bold py-3 px-6 rounded-lg transition-colors text-text-inverted">
                    {lang === 'vi' ? 'Tạo mã' : 'Generate Code'}
                </button>
                <button onClick={onClose} className="w-full sm:w-auto bg-base-300 hover:bg-base-300-hover font-bold py-3 px-6 rounded-lg transition-colors">
                    {lang === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
            </div>
        </div>
    </div>
  );
};

export default AssignmentSettingsModal;
