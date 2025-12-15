import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getToken } from "../utils/auth";

const QUIZ_PROGRESS_KEY = "quiz_progress";

const QuizResumer: React.FC = () => {
    const [showModal, setShowModal] = useState(false);
    const [savedData, setSavedData] = useState<any>(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Only check if we are NOT on the quiz page itself to avoid redundant prompts
        // or if the user refreshed the quiz page, let QuizPage handle restoration internally.
        if (location.pathname.startsWith("/quiz/")) {
            setShowModal(false);
            return;
        }

        const checkProgress = () => {
            try {
                const token = getToken();
                if (!token) {
                    setShowModal(false);
                    return;
                }

                const raw = localStorage.getItem(QUIZ_PROGRESS_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    // Check if data is valid and has quizId
                    if (data && data.quizId) {
                        // Maybe check timestamp expiry if needed? For now, infinite persistence until User clears.
                        setSavedData(data);
                        setShowModal(true);
                    }
                }
            } catch (e) {
                console.error("Error reading quiz progress:", e);
            }
        };

        checkProgress();

        // Listen for storage changes in case other tabs update it (optional but good)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === QUIZ_PROGRESS_KEY) {
                checkProgress();
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [location.pathname]);

    const handleYes = () => {
        if (savedData && savedData.quizId) {
            navigate(`/quiz/${savedData.quizId}`);
            setShowModal(false);
        }
    };

    const handleNo = () => {
        localStorage.removeItem(QUIZ_PROGRESS_KEY);
        setShowModal(false);
        setSavedData(null);
    };

    if (!showModal || !savedData) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 transform transition-all scale-100 animate-slideUp">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Tiếp tục làm bài ?
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    <i>Hệ thống phát hiện bạn thoát giữa chừng khi đang làm một bài kiểm tra. Bạn có muốn tiếp tục làm bài không ?</i>
                </p>

                {savedData.quizTitle && (
                    <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg border border-primary-100 dark:border-primary-800/30 mb-6">
                        <p className="text-sm font-bold text-primary-700 dark:text-primary-300">
                            {savedData.quizTitle}
                        </p>
                        {savedData.className && (
                            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mt-1">
                                Lớp: {savedData.className}
                            </p>
                        )}
                    </div>
                )}

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={handleNo}
                        className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
                    >
                        Không
                    </button>
                    <button
                        onClick={handleYes}
                        className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium shadow-lg hover:shadow-primary-600/30 transition-all transform hover:-translate-y-0.5"
                    >
                        Có, tiếp tục
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizResumer;
