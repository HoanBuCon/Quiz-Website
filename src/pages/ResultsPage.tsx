import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { FaArrowLeft, FaLightbulb, FaRedo, FaHistory, FaChalkboardTeacher, FaHome } from "react-icons/fa";
import { Quiz, Question, DragItem, DragTarget } from "../types";
import MathText from "../components/MathText";
import ImageModal from "../components/ImageModal";

interface QuizResult {
  quizId: string;
  quizTitle: string;
  userAnswers: Record<string, any>;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  completedAt: Date;
  quizSnapshot?: {
    quizTitle: string;
    questions: Question[];
  };
}

const ResultsPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExplanations, setShowExplanations] = useState(false);
  const passedOrder: string[] | undefined = location?.state?.questionOrder;

  // Detect navigation from ProfilePage
  const fromProfile = location?.state?.fromProfile;
  const activeTab = location?.state?.activeTab;
  const selectedClassId = location?.state?.selectedClassId;
  const selectedQuizId = location?.state?.selectedQuizId;

  // Floating scroll buttons
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [canScroll, setCanScroll] = useState(true);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Container bên trái (khu vực hiển thị câu hỏi chi tiết)
  const leftContentRef = useRef<HTMLDivElement | null>(null);

  // Shared measurement function to avoid duplication
  const computeScrollState = useCallback(() => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.documentElement;
    const viewH = window.innerHeight || 0;
    const docH = Math.max(body.scrollHeight, body.offsetHeight);
    const totalScrollable = Math.max(0, docH - viewH);
    const threshold = 80;
    const scrollable = totalScrollable > threshold;
    setCanScroll(scrollable);
    if (!scrollable) {
      setAtTop(true);
      setAtBottom(true);
      return;
    }
    setAtTop(scrollY <= 10);
    setAtBottom(scrollY >= totalScrollable - 10);
  }, []);

  // Attach scroll listener once, and do an initial measurement
  useEffect(() => {
    // Defer first measurement until after first paint/content layout
    const rafId = requestAnimationFrame(computeScrollState);
    const tId = setTimeout(computeScrollState, 300);
    window.addEventListener("scroll", computeScrollState, { passive: true });
    return () => {
      window.removeEventListener("scroll", computeScrollState);
      cancelAnimationFrame(rafId);
      clearTimeout(tId);
    };
  }, [computeScrollState]);

  // Clean up any lingering quiz progress
  useEffect(() => {
    localStorage.removeItem("quiz_progress");
  }, []);

  // Recompute after content loads so the bottom button appears immediately
  useEffect(() => {
    if (loading) return;
    const rafId = requestAnimationFrame(computeScrollState);
    const tId = setTimeout(computeScrollState, 0);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(tId);
    };
  }, [loading, quiz, result, computeScrollState]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => {
    const body = document.documentElement;
    const docH = Math.max(body.scrollHeight, body.offsetHeight);
    window.scrollTo({ top: docH, behavior: "smooth" });
  };

  useEffect(() => {
    if (!quizId) {
      navigate("/");
      return;
    }

    // [MODIFIED] Check for manual result (from Retry Mode)
    if (location.state?.manualResult) {
      setResult(location.state.manualResult);
      if (location.state.manualResult.quizSnapshot) {
        setQuiz(location.state.manualResult.quizSnapshot);
      }
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          navigate("/");
          return;
        }
        const { SessionsAPI, QuizzesAPI } = await import("../utils/api");

        // Determine which session to load
        // 1. From state (history navigation)
        // 2. Or latest session (default)
        let targetSession: any = null;
        if (location.state?.sessionId) {
          targetSession = await SessionsAPI.getOne(location.state.sessionId, token);
        } else {
          const sessions = await SessionsAPI.byQuiz(quizId, token);
          if (sessions && sessions.length > 0) {
            targetSession = await SessionsAPI.getOne(sessions[0].id, token);
          }
        }

        if (!targetSession) {
          navigate("/");
          return;
        }

        // Fetch full quiz (includes questions)
        const fullQuiz = await QuizzesAPI.getById(quizId, token);
        setQuiz(fullQuiz);
        setResult({
          quizId: targetSession.quizId,
          quizTitle: fullQuiz?.title || "",
          userAnswers: targetSession.answers || {},
          score: targetSession.score,
          totalQuestions: targetSession.totalQuestions,
          timeSpent: targetSession.timeSpent,
          completedAt: new Date(targetSession.completedAt),
          quizSnapshot: targetSession.quizSnapshot,
        });
      } catch (e) {
        console.error("Failed to load results:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId, navigate, location.state]);

  const findQuiz = (_id: string) => {
    // Deprecated: logic thay thế bằng gọi backend
  };

  const getAnswerStatus = (question: Question, userAnsRaw: any) => {
    const correctAnswers = question.correctAnswers as any;
    let isCorrect = false;

    if (question.type === "text") {
      const uaArr: string[] = Array.isArray(userAnsRaw)
        ? userAnsRaw
        : [String(userAnsRaw || "")];
      const userText = (uaArr[0] || "").trim().toLowerCase();
      const caArr: string[] = Array.isArray(correctAnswers)
        ? correctAnswers
        : [];
      const validCorrectAnswers = caArr.filter((ans: string) => ans?.trim());
      if (validCorrectAnswers.length > 0) {
        isCorrect = validCorrectAnswers.some(
          (correct: string) => correct.trim().toLowerCase() === userText
        );
      }
    } else if (question.type === "drag") {
      const userMapping =
        userAnsRaw && typeof userAnsRaw === "object" ? userAnsRaw : {};
      const correctMap: Record<string, string> =
        correctAnswers && typeof correctAnswers === "object"
          ? correctAnswers
          : {};

      // console.log("🔍 Drag question scoring:", {
      //   questionId: question.id,
      //   userMapping,
      //   correctMap,
      // });

      // Lấy tất cả items từ question.options
      const dragOpt = (question.options as any) || { items: [] };
      const allItems = Array.isArray(dragOpt.items) ? dragOpt.items : [];

      // Kiểm tra từng item
      isCorrect = allItems.every((item: any) => {
        const itemId = item.id;
        const userTargetId = userMapping[itemId];
        const correctTargetId = correctMap[itemId];

        // Chuẩn hóa giá trị: undefined, null, '' đều được coi là "không thuộc nhóm nào"
        const normalizedUserTarget = userTargetId || undefined;
        const normalizedCorrectTarget = correctTargetId || undefined;

        // console.log(`  Item "${item.label}" (${itemId}):`, {
        //   userTargetId,
        //   correctTargetId,
        //   normalizedUserTarget,
        //   normalizedCorrectTarget,
        //   isMatch: normalizedUserTarget === normalizedCorrectTarget,
        // });

        // So sánh sau khi chuẩn hóa
        return normalizedUserTarget === normalizedCorrectTarget;
      });
    } else {
      const uaArr: string[] = Array.isArray(userAnsRaw) ? userAnsRaw : [];
      const caArr: string[] = Array.isArray(correctAnswers)
        ? correctAnswers
        : [];
      isCorrect =
        uaArr.length === caArr.length &&
        uaArr.every((answer: string) => caArr.includes(answer));
    }

    return { isCorrect, userAnswer: userAnsRaw, correctAnswers };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getScoreColor = (score: number, total: number) => {
    const percentage = (score / total) * 100;
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  // xác định thứ tự câu hỏi giống trang làm bài
  const displayQuestions: Question[] = useMemo(() => {
    // Priority 1: Snapshot questions (exact state at submission)
    if (result && (result as any).quizSnapshot && Array.isArray((result as any).quizSnapshot.questions)) {
      return (result as any).quizSnapshot.questions;
    }

    // Priority 2: Standard quiz loading
    if (!quiz) return [] as any;
    const fromState = Array.isArray(passedOrder) ? passedOrder : undefined;
    let fromStorage: string[] | undefined;
    try {
      const raw = sessionStorage.getItem(`quizOrder:${quizId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.order)) fromStorage = parsed.order;
      }
    } catch { }
    const order = fromState || fromStorage;
    if (!order || order.length === 0) return quiz.questions as any;
    const map = new Map((quiz.questions as any).map((q: Question) => [q.id, q]));
    const arr = order.map((id) => map.get(id)).filter(Boolean) as Question[];
    // phòng trường hợp có câu mới không trong order
    const extras = (quiz.questions as any).filter(
      (q: Question) => !order.includes(q.id)
    );
    return [...arr, ...extras];
  }, [quiz, passedOrder, quizId, result]);

  const isQuestionWrongForResult = (q: any): boolean => {
    if (!result) return false;
    if (q.type === "composite" && Array.isArray(q.subQuestions)) {
      return q.subQuestions.some((sub: any) => {
        const ua = result.userAnswers[sub.id];
        return !getAnswerStatus(sub, ua).isCorrect;
      });
    }
    const ua = result.userAnswers[q.id];
    return !getAnswerStatus(q, ua).isCorrect;
  };

  const handleRetryIncorrect = () => {
    if (!quiz || !result) return;

    // Calculate incorrect questions
    const incorrectQs = displayQuestions.filter(q => isQuestionWrongForResult(q));
    const incorrectIds = incorrectQs.map(q => q.id);

    if (incorrectIds.length === 0) {
      alert("Bạn đã làm đúng tất cả các câu hỏi!");
      return;
    }

    navigate(`/quiz/${quizId}`, {
      state: {
        retryMode: true,
        incorrectOrder: incorrectIds,
        className: (quiz as any)?.className,
        // Pass original questions if needed, but quiz page should refetch or reuse
      }
    });
  };

  if (loading) {
    const Spinner = require("../components/SpinnerLoading").default;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ transform: 'scale(0.435)' }}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (!quiz || !result) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Không tìm thấy kết quả quiz
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Kết quả quiz không còn khả dụng hoặc đã hết hạn.
          </p>
          <Link to="/" className="btn-primary">
            Về trang chủ
          </Link>
        </div>
      </div>
    );
  }


  const percentage = Math.round((result.score / result.totalQuestions) * 100);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header với kết quả tổng quan */}
      <div className="card p-8 mb-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Kết quả làm bài
          </h1>
          <h2 className="text-xl text-gray-600 dark:text-gray-400">
            {result.quizTitle}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div className="text-center">
            <div
              className={`text-4xl font-bold ${getScoreColor(
                result.score,
                result.totalQuestions
              )} mb-2`}
            >
              {result.score}/{result.totalQuestions}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Điểm số
            </div>
          </div>

          <div className="text-center">
            <div
              className={`text-4xl font-bold ${getScoreColor(
                result.score,
                result.totalQuestions
              )} mb-2`}
            >
              {percentage}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Tỷ lệ đúng
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {formatTime(result.timeSpent)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Thời gian
            </div>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold text-gray-600 dark:text-gray-400 mb-2">
              {result.totalQuestions - result.score}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Câu sai
            </div>
          </div>
        </div>

        {/* Thanh tiến độ */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-4">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${percentage >= 80
              ? "bg-green-500"
              : percentage >= 60
                ? "bg-yellow-500"
                : "bg-red-500"
              }`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>

        {/* Thông báo kết quả */}
        <div className="text-center">
          {percentage >= 80 && (
            <p className="text-green-600 font-semibold">
              🎉 Xuất sắc! Bạn đã làm bài rất tốt!
            </p>
          )}
          {percentage >= 60 && percentage < 80 && (
            <p className="text-yellow-600 font-semibold">
              👍 Khá tốt! Bạn có thể làm tốt hơn nữa!
            </p>
          )}
          {percentage < 60 && (
            <p className="text-red-600 font-semibold">
              💪 Hãy cố gắng hơn! Xem lại lý thuyết và thử lại!
            </p>
          )}
        </div>
      </div>

      {/* Nút điều khiển */}
      {/* Nút điều khiển */}
      <div className={`grid grid-cols-2 ${!location.state?.isRetryResult ? 'xl:grid-cols-5 md:grid-cols-3' : 'xl:grid-cols-4 md:grid-cols-2'} gap-3 mb-8`}>
        <button
          onClick={() => setShowExplanations(!showExplanations)}
          className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          <FaLightbulb />
          {showExplanations ? "Ẩn giải thích" : "Hiện giải thích"}
        </button>
        <button
          onClick={() =>
            navigate(`/quiz/${quizId}`, {
              state: { className: (quiz as any)?.className },
            })
          }
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <FaHistory />
          {location.state?.isRetryResult ? "Làm lại từ đầu" : (fromProfile ? "Làm Quiz" : "Làm lại Quiz")}
        </button>

        {!location.state?.isRetryResult && (
          <button
            onClick={handleRetryIncorrect}
            className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            <FaRedo />
            Làm lại câu sai
          </button>
        )}
        <Link to="/classes" className="btn-secondary w-full inline-flex items-center justify-center gap-2">
          <FaChalkboardTeacher />
          Xem lớp học khác
        </Link>
        <Link to="/" className="btn-secondary w-full inline-flex items-center justify-center gap-2">
          <FaHome />
          Về trang chủ
        </Link>
      </div>

      {/* Layout 2 cột: Trái = kết quả, Phải = minimap */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Trái: kết quả chi tiết */}
        <div
          ref={leftContentRef}
          className="flex-1 min-w-0 order-2 lg:order-1"
        >
          {/* Chi tiết từng câu hỏi */}
          <div className="space-y-6">
            {displayQuestions.map((q: any, qIndex: number) => {
              // Xử lý câu hỏi composite - hiển thị câu hỏi mẹ và các câu con
              if (q.type === "composite" && Array.isArray(q.subQuestions)) {
                return (
                  <div
                    key={q.id}
                    id={`q-${q.id}`}
                    className="card p-6 border-2 border-primary-200 dark:border-primary-800 transition-all duration-300 ease-in-out"
                  >
                    {/* Câu hỏi mẹ */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <h4 className="text-lg font-bold text-primary-700 dark:text-primary-300 whitespace-pre-wrap flex items-start">
                          <span className="shrink-0 mr-2">Câu {qIndex + 1}:</span>
                          <MathText text={q.question} />
                        </h4>
                        <span className="text-xs px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 whitespace-nowrap">
                          {q.subQuestions.length} câu hỏi
                        </span>
                      </div>
                      {q.questionImage && (
                        <img
                          src={q.questionImage}
                          alt="Question"
                          className="max-w-full max-h-64 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 mb-4 cursor-zoom-in"
                          onClick={() => setViewingImage(q.questionImage!)}
                        />
                      )}
                    </div>

                    {/* Các câu hỏi con */}
                    <div className="space-y-4 pl-4 border-l-4 border-primary-300 dark:border-primary-700">
                      {q.subQuestions.map((subQ: any, subIndex: number) => {
                        const userAnswer = result.userAnswers[subQ.id] || [];
                        const { isCorrect, correctAnswers } = getAnswerStatus(
                          subQ,
                          userAnswer
                        );
                        return (
                          <div
                            key={subQ.id}
                            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-start gap-2 flex-1">
                                <h5 className="text-base font-semibold text-gray-900 dark:text-white whitespace-pre-wrap flex items-start">
                                  <span className="shrink-0 mr-1">Câu {qIndex + 1}.{subIndex + 1}: </span>
                                  <MathText text={subQ.question} />
                                </h5>
                                {isCorrect ? (
                                  <span className="text-green-600 shrink-0 mt-1">✓</span>
                                ) : (
                                  <span className="text-red-600 shrink-0 mt-1">✗</span>
                                )}
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-semibold ${isCorrect
                                  ? "bg-green-200 text-green-900 dark:bg-green-900/20 dark:text-green-400"
                                  : "bg-red-200 text-red-900 dark:bg-red-900/20 dark:text-red-400"
                                  }`}
                              >
                                {isCorrect ? "Đúng" : "Sai"}
                              </span>
                            </div>

                            {/* Hiển thị ảnh câu hỏi con nếu có */}
                            {subQ.questionImage && (
                              <div className="mb-3">
                                <img
                                  src={subQ.questionImage}
                                  alt="Question"
                                  className="max-w-full max-h-48 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                                  onClick={() => setViewingImage(subQ.questionImage!)}
                                />
                              </div>
                            )}

                            {/* Hiển thị đáp án của câu con */}
                            <div className="space-y-2">
                              {subQ.type === "text" ? (
                                <div className="space-y-2">
                                  <div
                                    className={`p-2 rounded-lg border text-sm whitespace-pre-wrap ${isCorrect
                                      ? "bg-green-100 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
                                      : "bg-red-200 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
                                      }`}
                                  >
                                    <span className="font-medium">
                                      Câu trả lời của bạn:{" "}
                                    </span>
                                    {userAnswer[0] || "(Không trả lời)"}
                                    {isCorrect && <span className="ml-2">✓</span>}
                                  </div>
                                  {!isCorrect && (
                                    <div className="p-2 rounded-lg border bg-green-100 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300 text-sm whitespace-pre-wrap">
                                      <span className="font-medium">
                                        Đáp án đúng:{" "}
                                      </span>
                                      {Array.isArray(correctAnswers) &&
                                        (correctAnswers as string[]).filter(
                                          (ans: string) => ans?.trim()
                                        ).length > 0
                                        ? (correctAnswers as string[])
                                          .filter((ans: string) => ans?.trim())
                                          .map((ans, i) => <MathText key={i} text={ans} className="inline-block mr-1" />)
                                        : "Chưa có đáp án"}
                                    </div>
                                  )}
                                </div>
                              ) : subQ.type === "drag" ? (
                                <ResultDragDropView
                                  question={subQ}
                                  userMapping={(userAnswer && typeof userAnswer[0] === "object" ? userAnswer[0] : {}) as Record<string, string>}
                                  correctMapping={(correctAnswers && typeof correctAnswers === "object" ? correctAnswers : {}) as Record<string, string>}
                                />
                              ) : Array.isArray(subQ.options) ? (
                                <>
                                  {(subQ.options as string[]).map(
                                    (option: string, optIndex: number) => {
                                      const uaArr: string[] = Array.isArray(
                                        userAnswer
                                      )
                                        ? userAnswer
                                        : [];
                                      const caArr: string[] = Array.isArray(
                                        correctAnswers
                                      )
                                        ? correctAnswers
                                        : [];
                                      const isUserChoice = uaArr.includes(option);
                                      const isCorrectOption =
                                        caArr.includes(option);
                                      let optionClass =
                                        "p-2 rounded-lg border transition-colors text-sm ";
                                      if (isCorrectOption) {
                                        optionClass +=
                                          "bg-green-100 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300";
                                      } else if (isUserChoice && !isCorrectOption) {
                                        optionClass +=
                                          "bg-red-200 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300";
                                      } else {
                                        optionClass +=
                                          "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300";
                                      }
                                      return (
                                        <div key={optIndex} className={optionClass}>
                                          <div className="flex items-start justify-between">
                                            <span className="whitespace-pre-wrap flex items-start">
                                              <span className="shrink-0 mr-1">{String.fromCharCode(65 + optIndex)}. </span>
                                              <MathText text={option} />
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                              {isUserChoice && (
                                                <span
                                                  className={`text-xs font-semibold ${isCorrectOption
                                                    ? "text-green-800 dark:text-green-400"
                                                    : "text-red-800 dark:text-red-400"
                                                    }`}
                                                >
                                                  {isCorrectOption
                                                    ? "✓ Bạn chọn (Đúng)"
                                                    : "✗ Bạn chọn (Sai)"}
                                                </span>
                                              )}
                                              {isCorrectOption && !isUserChoice && (
                                                <span className="text-xs font-semibold text-green-800 dark:text-green-400">
                                                  ✓ Đáp án đúng
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {/* Hiển thị ảnh đáp án câu con nếu có */}
                                          {subQ.optionImages && subQ.optionImages[option] && (
                                            <div className="mt-2">
                                              <img
                                                src={subQ.optionImages[option]}
                                                alt={`Option ${String.fromCharCode(65 + optIndex)}`}
                                                className="max-w-xs max-h-32 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                                                onClick={() => setViewingImage(subQ.optionImages![option])}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                  )}
                                </>
                              ) : null}
                            </div>

                            {showExplanations && subQ.explanation && (
                              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-sm">
                                <h6 className="font-medium text-blue-900 dark:text-blue-300 mb-1">
                                  💡 Giải thích:
                                </h6>
                                <div className="text-blue-800 dark:text-blue-200 whitespace-pre-line">
                                  <MathText text={subQ.explanation} className="text-blue-800 dark:text-blue-200" />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Hiển thị giải thích của câu hỏi mẹ nếu có */}
                    {showExplanations && q.explanation && (
                      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                        <h5 className="font-bold text-blue-900 dark:text-blue-300 mb-2 flex items-center">
                          <span className="mr-2">💡</span>
                          Giải thích chi tiết cho nhóm câu hỏi:
                        </h5>
                        <div className="text-blue-800 dark:text-blue-200 text-base leading-relaxed whitespace-pre-line">
                          <MathText text={q.explanation} className="text-blue-800 dark:text-blue-200" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Prevent rendering broken composite parents (from flat snapshots)
              if (q.type === "composite") return null;

              // Câu hỏi thông thường (không phải composite)
              const userAnswer = result.userAnswers[q.id] || [];
              const { isCorrect, correctAnswers } = getAnswerStatus(q, userAnswer);
              return (
                <div key={q.id} id={`q-${q.id}`} className="card p-6 transition-all duration-300 ease-in-out">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-start">
                        <span className="mr-3 whitespace-nowrap shrink-0">Câu {qIndex + 1}:</span>
                        {isCorrect ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-red-600">✗</span>
                        )}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {q.type === 'single'
                          ? "Chọn một đáp án"
                          : q.type === 'multiple'
                            ? "Chọn nhiều đáp án"
                            : q.type === 'drag'
                              ? "Kéo thả đáp án vào nhóm tương ứng"
                              : "Điền đáp án"}
                      </span>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${isCorrect
                        ? "bg-green-200 text-green-900 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-red-200 text-red-900 dark:bg-red-900/20 dark:text-red-400"
                        }`}
                    >
                      {isCorrect ? "Đúng" : "Sai"}
                    </span>
                  </div>

                  <p className="text-gray-900 dark:text-white mb-4 text-lg whitespace-pre-wrap">
                    <MathText text={q.question} />
                  </p>

                  {/* Hiển thị ảnh câu hỏi nếu có */}
                  {(q as any).questionImage && (
                    <div className="mb-4">
                      <img
                        src={(q as any).questionImage}
                        alt="Question"
                        className="max-w-full max-h-64 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                        onClick={() => setViewingImage((q as any).questionImage!)}
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    {q.type === "text" ? (
                      <div className="space-y-3">
                        <div
                          className={`p-3 rounded-lg border whitespace-pre-wrap ${isCorrect
                            ? "bg-green-200 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
                            : "bg-red-300 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              Câu trả lời của bạn:{" "}
                              {userAnswer[0] || "(Không trả lời)"}
                            </span>
                            <span
                              className={`text-sm font-semibold ${isCorrect
                                ? "text-green-800 dark:text-green-400"
                                : "text-red-800 dark:text-red-400"
                                }`}
                            >
                              {isCorrect ? "✓ Đúng" : "✗ Sai"}
                            </span>
                          </div>
                        </div>
                        {!isCorrect && (
                          <div className="p-3 rounded-lg border bg-green-200 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300 whitespace-pre-wrap">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                Đáp án đúng:{" "}
                                {Array.isArray(correctAnswers) &&
                                  (correctAnswers as string[]).filter((ans: string) =>
                                    ans?.trim()
                                  ).length > 0
                                  ? (correctAnswers as string[])
                                    .filter((ans: string) => ans?.trim())
                                    .map((ans, i) => <MathText key={i} text={ans} className="inline-block mr-1" />)
                                  : "Chưa có đáp án được thiết lập"}
                              </span>
                              <span className="text-sm font-semibold text-green-800 dark:text-green-400">
                                ✓ Đáp án đúng
                              </span>
                            </div>
                            {Array.isArray(correctAnswers) &&
                              (correctAnswers as string[]).filter((ans: string) =>
                                ans?.trim()
                              ).length === 0 && (
                                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                                  ⚠️ Câu hỏi này chưa được thiết lập đáp án đúng
                                </p>
                              )}
                          </div>
                        )}
                      </div>
                    ) : q.type === "drag" ? (
                      <div className="space-y-3">
                        <ResultDragDropView
                          question={q}
                          userMapping={(userAnswer && typeof userAnswer === "object" ? userAnswer : {}) as Record<string, string>}
                          correctMapping={(correctAnswers && typeof correctAnswers === "object" ? correctAnswers : {}) as Record<string, string>}
                        />
                      </div>
                    ) : Array.isArray(q.options) ? (
                      <>
                        {(q.options as string[]).map(
                          (option: string, optionIndex: number) => {
                            const uaArr: string[] = Array.isArray(userAnswer)
                              ? userAnswer
                              : [];
                            const caArr: string[] = Array.isArray(correctAnswers)
                              ? correctAnswers
                              : [];
                            const isUserChoice = uaArr.includes(option);
                            const isCorrectOption = caArr.includes(option);
                            let optionClass =
                              "p-3 rounded-lg border transition-colors ";
                            if (isCorrectOption) {
                              optionClass +=
                                "bg-green-200 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300";
                            } else if (isUserChoice && !isCorrectOption) {
                              optionClass +=
                                "bg-red-300 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300";
                            } else {
                              optionClass +=
                                "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300";
                            }
                            return (
                              <div key={optionIndex} className={optionClass}>
                                <div className="flex items-center justify-between">
                                  <span className="whitespace-pre-wrap"><MathText text={option} /></span>
                                  <div className="flex items-center gap-2">
                                    {isUserChoice && (
                                      <span
                                        className={`text-sm font-semibold ${isCorrectOption
                                          ? "text-green-800 dark:text-green-400"
                                          : "text-red-800 dark:text-red-400"
                                          }`}
                                      >
                                        {isCorrectOption
                                          ? "✓ Bạn chọn (Đúng)"
                                          : "✗ Bạn chọn (Sai)"}
                                      </span>
                                    )}
                                    {isCorrectOption && !isUserChoice && (
                                      <span className="text-sm font-semibold text-green-800 dark:text-green-400">
                                        ✓ Đáp án đúng
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Hiển thị ảnh đáp án nếu có */}
                                {(q as any).optionImages && (q as any).optionImages[option] && (
                                  <div className="mt-2">
                                    <img
                                      src={(q as any).optionImages[option]}
                                      alt={`Option ${String.fromCharCode(65 + optionIndex)}`}
                                      className="max-w-xs max-h-32 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                                      onClick={() => setViewingImage((q as any).optionImages[option])}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </>
                    ) : null}
                  </div>

                  {showExplanations && q.explanation && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <h5 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
                        💡 Giải thích:
                      </h5>
                      <div className="text-blue-800 dark:text-blue-200 whitespace-pre-line">
                        <MathText text={q.explanation} className="text-sm text-blue-700 dark:text-blue-300" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Nút dưới cùng (làm lại, xem lớp, về trang chủ) */}
          <div className="mt-8 text-center">
            <div className={`w-full grid grid-cols-2 ${!location.state?.isRetryResult ? 'xl:grid-cols-5 md:grid-cols-3' : 'xl:grid-cols-4 md:grid-cols-2'} gap-3`}>
              <button
                onClick={() => setShowExplanations(!showExplanations)}
                className="w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                <FaLightbulb />
                {showExplanations ? "Ẩn giải thích" : "Hiện giải thích"}
              </button>
              <button
                onClick={() => navigate(`/quiz/${quizId}`)}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                <FaHistory />
                {location.state?.isRetryResult ? "Làm lại từ đầu" : "Làm lại Quiz"}
              </button>

              {!location.state?.isRetryResult && (
                <button
                  onClick={handleRetryIncorrect}
                  className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  <FaRedo />
                  Làm lại câu sai
                </button>
              )}

              <Link
                to="/classes"
                className="btn-secondary w-full inline-flex items-center justify-center gap-2"
              >
                <FaChalkboardTeacher />
                Xem lớp học khác
              </Link>
              <Link
                to="/"
                className="btn-secondary w-full inline-flex items-center justify-center gap-2"
              >
                <FaHome />
                Về trang chủ
              </Link>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Hoàn thành lúc: {new Date(result.completedAt).toLocaleString("vi-VN")}
            </p>
          </div>
        </div>

        {/* Phải: minimap & back button */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 order-1 lg:order-2 lg:self-start sticky top-20 xl:top-4 z-30">
          {/* Back Button - Only shown when navigating from ProfilePage */}
          {fromProfile && (
            <button
              onClick={() => navigate('/profile', { state: { activeTab, selectedClassId, selectedQuizId } })}
              className="mb-4 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 border border-gray-200 dark:border-gray-700 font-medium"
              title="Trở lại Profile"
              aria-label="Trở lại Profile"
            >
              <FaArrowLeft className="text-lg" />
              <span>Trở lại Profile</span>
            </button>
          )}

          <div className="card p-4 sm:p-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="flex overflow-x-auto snap-x no-scrollbar gap-2 p-4 -m-4 lg:m-0 lg:p-0 lg:grid lg:grid-cols-5 lg:gap-2">
              {displayQuestions.map((q: any, index: number) => {
                const wrong = isQuestionWrongForResult(q);
                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => {
                      const container = leftContentRef.current;
                      if (!container) return;

                      // Quan trọng: chỉ tìm phần tử trong cùng ResultsPage (tránh đụng bản ẩn trong SidebarLayout)
                      const el = container.querySelector(
                        `#q-${q.id}`
                      ) as HTMLElement | null;
                      if (!el) return;

                      const scrollContainer = el.closest(
                        ".custom-scrollbar"
                      ) as HTMLElement | null;

                      const isDesktop =
                        typeof window !== "undefined" &&
                        window.matchMedia("(min-width: 1280px)").matches;

                      if (isDesktop && scrollContainer) {
                        // Cuộn trong container của SidebarLayout (desktop)
                        const containerRect =
                          scrollContainer.getBoundingClientRect();
                        const elementRect = el.getBoundingClientRect();
                        const currentScroll = scrollContainer.scrollTop;
                        const offset = 16; // chút khoảng trống phía trên

                        const targetScroll =
                          currentScroll +
                          (elementRect.top - containerRect.top) -
                          offset;

                        scrollContainer.scrollTo({
                          top: targetScroll,
                          behavior: "smooth",
                        });
                      } else {
                        // Layout dùng header (mobile/tablet): cuộn theo window
                        const offset = 100; // bù cho header cố định
                        const elementPosition = el.getBoundingClientRect().top;
                        const offsetPosition =
                          elementPosition + window.pageYOffset - offset;
                        window.scrollTo({
                          top: offsetPosition,
                          behavior: "smooth",
                        });
                      }
                    }}
                    className={`flex-shrink-0 w-10 h-10 lg:w-auto lg:h-auto flex items-center justify-center snap-center p-0 lg:p-2 text-center rounded-lg transition-all duration-200 border-2 text-xs sm:text-sm cursor-pointer ${wrong
                      ? "bg-red-600 text-white font-medium border-transparent shadow-md shadow-red-600/20 dark:bg-red-900/40 dark:text-red-400 dark:border-red-500"
                      : "bg-green-500 text-white font-medium border-green-500 shadow-md shadow-green-500/20 dark:text-green-400 dark:bg-green-900/20 dark:shadow-md dark:shadow-green-500/20"
                      }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating scroll buttons */}
      {/* Image viewer modal */}
      {viewingImage && (
        <ImageModal
          imageUrl={viewingImage}
          isOpen={!!viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {canScroll && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
          {!atTop && !atBottom && (
            <button
              onClick={scrollToTop}
              className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
          )}
          {atTop && (
            <button
              onClick={scrollToBottom}
              className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
          {atBottom && (
            <button
              onClick={scrollToTop}
              className="w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsPage;

const ResultDragDropView: React.FC<{
  question: Question;
  userMapping: Record<string, string>;
  correctMapping: Record<string, string>;
}> = ({ question, userMapping, correctMapping }) => {
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const targets = ((question.options as any)?.targets as DragTarget[]) || [];
  const items = ((question.options as any)?.items as DragItem[]) || [];

  // Items chưa được user xếp vào đâu
  const poolItems = items.filter((it) => !userMapping[it.id]);

  // Group items vào các target mà user đã chọn
  // (Lưu ý: userMapping[itemId] = targetId)
  const itemsByTarget: Record<string, DragItem[]> = {};
  targets.forEach((t) => (itemsByTarget[t.id] = []));
  items.forEach((it) => {
    const tid = userMapping[it.id];
    if (tid && itemsByTarget[tid]) {
      itemsByTarget[tid].push(it);
    }
  });

  const getStatusColor = (item: DragItem, targetId: string) => {
    const correctTargetId = correctMapping[item.id];
    // Check if item is correctly placed
    if (correctTargetId === targetId) {
      return "bg-green-500 text-white border-transparent shadow-[0_2px_8px_rgba(34,197,94,0.4)] dark:bg-green-600/80 dark:text-white dark:shadow-[0_2px_8px_rgba(34,197,94,0.2)]"; // Correct
    }
    return "bg-red-500 text-white border-transparent shadow-[0_2px_8px_rgba(239,68,68,0.4)] dark:bg-red-800/60 dark:text-red-100 dark:shadow-[0_2px_8px_rgba(239,68,68,0.2)]"; // Wrong placement
  };

  return (
    <div className="space-y-6">
      {viewingImage && (
        <ImageModal
          imageUrl={viewingImage}
          isOpen={!!viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* 1. Kho chưa phân loại (Pool) */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-xl p-4 bg-gray-200/40 dark:bg-gray-900/30">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center uppercase text-sm tracking-wide">
          Không thuộc nhóm nào
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {poolItems.map((it) => {
            // Check if this item SHOULD have been placed somewhere
            const correctTargetId = correctMapping[it.id];
            // If it should have been placed but wasn't, mark as wrong (red border/light bg?)
            // Or just keep neutral? Usually neutral looks better for "unanswered".
            // But if we want strict grading:
            const isMissed = !!correctTargetId;

            return (
              <div
                key={it.id}
                className={`p-3 rounded-lg border-2 font-medium flex items-center gap-2 transition-all ${isMissed
                  ? "bg-red-200 border-red-500 text-red-900 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
                  : "bg-green-100 border-green-400 text-green-900 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300"
                  }`}
              >
                <div className="flex-1 whitespace-pre-wrap">
                  <MathText text={it.label} />
                </div>
                {/* Ảnh đáp án nếu có */}
                {(question as any).optionImages?.[it.label] && (
                  <img
                    src={(question as any).optionImages[it.label]}
                    alt="Option"
                    className="w-10 h-10 object-cover rounded border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                    onClick={() => setViewingImage((question as any).optionImages[it.label])}
                  />
                )}
              </div>
            );
          })}
          {poolItems.length === 0 && (
            <p className="col-span-full text-center text-sm text-gray-400 italic py-2">
              Đã phân loại hết
            </p>
          )}
        </div>
      </div>

      {/* 2. Các nhóm đích (Targets) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {targets.map((t) => (
          <div
            key={t.id}
            className="border-2 border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-200/40 dark:bg-gray-900/30 shadow-sm"
          >
            <div className="flex items-start justify-between mb-4 pb-2 border-b border-gray-300/50 dark:border-gray-700">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                {t.label}
              </h3>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0 ml-2">
                {(itemsByTarget[t.id] || []).length} đáp án
              </span>
            </div>

            <div className="space-y-2 min-h-[60px]">
              {(itemsByTarget[t.id] || []).map((it) => (
                <div
                  key={it.id}
                  className={`p-3 rounded-lg font-medium text-sm transition-all flex items-center justify-between gap-2 ${getStatusColor(
                    it,
                    t.id
                  )}`}
                >
                  <div className="whitespace-pre-wrap flex-1">
                    <MathText text={it.label} />
                  </div>
                  {(question as any).optionImages?.[it.label] && (
                    <img
                      src={(question as any).optionImages[it.label]}
                      alt="Option"
                      className="w-8 h-8 object-cover rounded bg-white cursor-zoom-in"
                      onClick={() => setViewingImage((question as any).optionImages[it.label])}
                    />
                  )}
                </div>
              ))}
              {(itemsByTarget[t.id] || []).length === 0 && (
                <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg">
                  Trống
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Hiển thị đáp án đúng (Key) */}
      <div className="mt-4 p-4 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/10">
        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
          <span>🗝️</span> Đáp án chính xác
        </h4>
        <div className="space-y-2">
          {items.map((it) => {
            const correctTid = correctMapping[it.id];
            const correctTarget = targets.find((t) => t.id === correctTid);
            const userTid = userMapping[it.id];

            // Chỉ highlight dòng này nếu user làm sai item này
            const isUserWrong = userTid !== correctTid;

            if (!isUserWrong) return null; // Chỉ hiện những câu sai để gọn? Hoặc hiện hết? 
            // Thường ResultsPage nên hiện hết hoặc ít nhất là highlight cái sai.
            // Để giống QuizPage reveal, ta hiện hết list nhưng highlight distinctively.
            // "Correct Answer" section usually shows the full truth.

            return (
              // Return null here to filter ONLY WRONG? 
              // User asked for style update. 
              // Let's show full list in a compact way, or just list items.
              // Replicating QuizPage reveal style:
              null
            );
          })}

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 list-none">
            {items.map(it => {
              const correctTid = correctMapping[it.id];
              const correctTarget = targets.find((t) => t.id === correctTid);
              const userTid = userMapping[it.id];
              const isUserWrong = userTid !== correctTid;

              return (
                <li key={it.id} className={`text-sm flex items-center gap-2 py-1 border-b border-gray-200/50 dark:border-gray-700/50 last:border-0 ${isUserWrong ? 'text-red-700 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  <span className={`${isUserWrong ? 'opacity-100' : 'opacity-70'}`}>
                    <MathText text={it.label} />
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className={`${isUserWrong ? 'text-gray-900 dark:text-gray-100' : ''}`}>
                    {correctTarget?.label || "(Không thuộc nhóm nào)"}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
