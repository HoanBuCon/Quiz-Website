import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getToken } from "../utils/auth";

const QUIZ_PROGRESS_KEY = "quiz_progress";
const QUIZ_EDIT_PROGRESS_KEY = "quiz_edit_progress";

const QuizResumer: React.FC = () => {
    const [showModal, setShowModal] = useState(false);
    const [savedData, setSavedData] = useState<any>(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Avoid showing if already on the relevant pages
        if (location.pathname.startsWith("/quiz/") || location.pathname.startsWith("/edit-quiz") || location.pathname.startsWith("/results/")) {
            setShowModal(false);
            return;
        }

        const checkProgress = () => {
            const token = getToken();
            if (!token) {
                setShowModal(false);
                return;
            }

            // 1. Check Quiz Progress
            const quizRaw = localStorage.getItem(QUIZ_PROGRESS_KEY);
            if (quizRaw) {
                try {
                    const data = JSON.parse(quizRaw);
                    // Only show if valid and young enough (optional: e.g. < 24h)
                    if (data && data.quizId) {
                        setSavedData({ ...data, type: 'quiz' });
                        setShowModal(true);
                        return;
                    }
                } catch (e) {
                    // console.error("Error parsing saved quiz:", e);
                }
            }

            // 2. Check Edit Progress (if no quiz progress)
            const editRaw = localStorage.getItem(QUIZ_EDIT_PROGRESS_KEY);
            if (editRaw) {
                try {
                    const data = JSON.parse(editRaw);
                    if (data && data.questions) {
                        setSavedData({ ...data, type: 'edit' });
                        setShowModal(true);
                        return;
                    }
                } catch (e) {
                    // console.error("Error parsing saved edit:", e);
                }
            }

            // If neither
            setShowModal(false);
        };

        checkProgress();

        // Listen for storage changes in other tabs
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === QUIZ_PROGRESS_KEY || e.key === QUIZ_EDIT_PROGRESS_KEY) {
                checkProgress();
            }
        };
        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, [location.pathname]);

    const handleYes = () => {
        if (!savedData) return;

        if (savedData.type === 'quiz') {
            navigate(`/quiz/${savedData.quizId}`);
        } else if (savedData.type === 'edit') {
            // Navigate to edit page with restored state
            navigate('/edit-quiz', { state: savedData.state });
        }

        setShowModal(false);
    };

    const handleNo = async () => {
        if (savedData?.type === 'quiz') {
            // Nếu người dùng từ chối tiếp tục làm bài, gọi API báo hiệu kết thúc attempt cũ
            if (savedData.attemptId) {
                try {
                    const { SessionsAPI } = await import("../utils/api");
                    const token = getToken();
                    if (token) {
                        await SessionsAPI.endAttempt(savedData.attemptId, token);
                    }
                } catch (e) {
                    // console.error("Failed to end attempt:", e);
                }
            }
            localStorage.removeItem(QUIZ_PROGRESS_KEY);
        } else if (savedData?.type === 'edit') {
            localStorage.removeItem(QUIZ_EDIT_PROGRESS_KEY);
        }
        setShowModal(false);
        setSavedData(null);
    };

    if (!showModal || !savedData) return null;

    const isEdit = savedData.type === 'edit';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 transform transition-all scale-100 animate-slideUp">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {isEdit ? "Tiếp tục chỉnh sửa ?" : "Tiếp tục làm bài ?"}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    <i>
                        {isEdit
                            ? "Hệ thống phát hiện bạn thoát giữa chừng khi đang chỉnh sửa một bài kiểm tra. Bạn có muốn tiếp tục chỉnh sửa không ?"
                            : "Hệ thống phát hiện bạn thoát giữa chừng khi đang làm một bài kiểm tra. Bạn có muốn tiếp tục làm bài không ?"
                        }
                    </i>
                </p>

                {savedData.quizTitle && (
                    <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg border border-primary-100 dark:border-primary-800/30 mb-6">
                        <p className="text-sm font-bold text-primary-700 dark:text-primary-300">
                            {savedData.originalTitle || savedData.quizTitle}
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
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        Không
                    </button>
                    <button
                        onClick={handleYes}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-500/30 transition-all transform active:scale-95"
                    >
                        Có
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuizResumer;
