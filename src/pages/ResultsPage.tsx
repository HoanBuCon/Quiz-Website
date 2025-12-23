import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { Quiz, Question } from "../types";
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

  // Floating scroll buttons
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const [canScroll, setCanScroll] = useState(true);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

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
    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          navigate("/");
          return;
        }
        const { SessionsAPI, QuizzesAPI } = await import("../utils/api");
        const sessions = await SessionsAPI.byQuiz(quizId, token);
        if (!sessions || sessions.length === 0) {
          navigate("/");
          return;
        }
        const latestMeta = sessions[0];
        // Fetch full session (includes answers)
        const latest = await SessionsAPI.getOne(latestMeta.id, token);
        // Fetch full quiz (includes questions)
        const fullQuiz = await QuizzesAPI.getById(quizId, token);
        setQuiz(fullQuiz);
        setResult({
          quizId: latest.quizId,
          quizTitle: fullQuiz?.title || "",
          userAnswers: latest.answers || {},
          score: latest.score,
          totalQuestions: latest.totalQuestions,
          timeSpent: latest.timeSpent,
          completedAt: new Date(latest.completedAt),
        });
      } catch (e) {
        // console.error("Failed to load results:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId, navigate]);

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
  }, [quiz, passedOrder, quizId]);

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

  if (loading) {
    const Spinner = require("../components/Spinner").default;
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex items-center justify-center">
        <Spinner size={48} />
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <button
          onClick={() => setShowExplanations(!showExplanations)}
          className="w-full inline-flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          {showExplanations ? "Ẩn giải thích" : "Hiện giải thích"}
        </button>
        <button
          onClick={() =>
            navigate(`/quiz/${quizId}`, {
              state: { className: (quiz as any)?.className },
            })
          }
          className="btn-primary w-full inline-flex items-center justify-center"
        >
          Làm lại Quiz
        </button>
        <Link to="/classes" className="btn-secondary w-full inline-flex items-center justify-center">
          Xem lớp học khác
        </Link>
        <Link to="/" className="btn-secondary w-full inline-flex items-center justify-center">
          Về trang chủ
        </Link>
      </div>

      {/* Layout 2 cột: Trái = kết quả, Phải = minimap */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Trái: kết quả chi tiết */}
        <div className="flex-1 min-w-0 order-2 lg:order-1">
          {/* Chi tiết từng câu hỏi */}
          <div className="space-y-6">
            {displayQuestions.map((q: any, qIndex: number) => {
              // Xử lý câu hỏi composite - hiển thị câu hỏi mẹ và các câu con
              if (q.type === "composite" && Array.isArray(q.subQuestions)) {
                return (
                  <div
                    key={q.id}
                    id={`q-${q.id}`}
                    className="card p-6 border-2 border-primary-200 dark:border-primary-800"
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
                                <p className="text-blue-800 dark:text-blue-200">
                                  <MathText text={subQ.explanation} className="text-blue-800 dark:text-blue-200" />
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // Câu hỏi thông thường (không phải composite)
              const userAnswer = result.userAnswers[q.id] || [];
              const { isCorrect, correctAnswers } = getAnswerStatus(q, userAnswer);
              return (
                <div key={q.id} id={`q-${q.id}`} className="card p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-start">
                      <span className="mr-3 whitespace-nowrap shrink-0">Câu {qIndex + 1}:</span>
                      {isCorrect ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗</span>
                      )}
                    </h4>
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
                        {(() => {
                          const userMapping =
                            userAnswer && typeof userAnswer === "object"
                              ? userAnswer
                              : {};
                          const correctMapping: Record<string, string> =
                            correctAnswers && typeof correctAnswers === "object"
                              ? correctAnswers
                              : {};
                          const dragOpt = (q.options as any) || {
                            targets: [],
                            items: [],
                          };
                          const targets = Array.isArray(dragOpt.targets)
                            ? dragOpt.targets
                            : [];
                          const items = Array.isArray(dragOpt.items)
                            ? dragOpt.items
                            : [];

                          return (
                            <div className="space-y-4">
                              {/* Hiển thị từng đáp án */}
                              {items.map((item: any) => {
                                const userTargetId = userMapping[item.id];
                                const correctTargetId = correctMapping[item.id];
                                const userTarget = targets.find(
                                  (t: any) => t.id === userTargetId
                                );
                                const correctTarget = targets.find(
                                  (t: any) => t.id === correctTargetId
                                );

                                // Xử lý trường hợp đáp án đúng là không thuộc nhóm nào
                                let isItemCorrect = false;
                                if (correctTargetId === undefined) {
                                  // Đáp án đúng là không thuộc nhóm nào
                                  isItemCorrect =
                                    userTargetId === undefined ||
                                    userTargetId === "";
                                } else {
                                  // Đáp án đúng là thuộc nhóm correctTargetId
                                  isItemCorrect = userTargetId === correctTargetId;
                                }

                                return (
                                  <div
                                    key={item.id}
                                    className={`p-4 rounded-lg border ${isItemCorrect
                                      ? "bg-green-200 border-green-400 dark:bg-green-900/20 dark:border-green-700"
                                      : "bg-red-300 border-red-500 dark:bg-red-900/20 dark:border-red-700"
                                      }`}
                                  >
                                    <div className="font-medium text-gray-900 dark:text-white mb-2 whitespace-pre-wrap">
                                      📝 <MathText text={item.label} />
                                    </div>
                                    {/* Hiển thị ảnh đáp án kéo thả nếu có */}
                                    {(q as any).optionImages && (q as any).optionImages[item.label] && (
                                      <div className="mb-2">
                                        <img
                                          src={(q as any).optionImages[item.label]}
                                          alt={`Item ${item.label}`}
                                          className="max-w-xs max-h-32 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-zoom-in"
                                          onClick={() => setViewingImage((q as any).optionImages[item.label])}
                                        />
                                      </div>
                                    )}
                                    <div className="space-y-1 text-sm">
                                      <div
                                        className={`${isItemCorrect
                                          ? "text-green-800 dark:text-green-300"
                                          : "text-red-800 dark:text-red-300"
                                          }`}
                                      >
                                        <span className="font-semibold">
                                          Bạn chọn:
                                        </span>{" "}
                                        <span className="whitespace-pre-wrap">
                                          {userTarget?.label ||
                                            "(Không thuộc nhóm nào)"}
                                        </span>
                                        {isItemCorrect && (
                                          <span className="ml-2">✓</span>
                                        )}
                                      </div>
                                      {!isItemCorrect && (
                                        <div className="text-green-800 dark:text-green-300">
                                          <span className="font-semibold">
                                            Đáp án đúng:
                                          </span>{" "}
                                          <span className="whitespace-pre-wrap">
                                            {correctTarget?.label ||
                                              "(Không thuộc nhóm nào)"}
                                          </span>{" "}
                                          ✓
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Tổng kết */}
                              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  <span className="font-semibold">Kết quả:</span>{" "}
                                  Bạn đã phân loại đúng{" "}
                                  {
                                    items.filter((item: any) => {
                                      const userTargetId = userMapping[item.id];
                                      const correctTargetId =
                                        correctMapping[item.id];
                                      if (correctTargetId === undefined) {
                                        return (
                                          userTargetId === undefined ||
                                          userTargetId === ""
                                        );
                                      }
                                      return userTargetId === correctTargetId;
                                    }).length
                                  }
                                  /{items.length} đáp án
                                </div>
                              </div>
                            </div>
                          );
                        })()}
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
                      <p className="text-blue-800 dark:text-blue-200">
                        <MathText text={q.explanation} className="text-sm text-blue-700 dark:text-blue-300" />
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Nút dưới cùng (làm lại, xem lớp, về trang chủ) */}
          <div className="mt-8 text-center">
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setShowExplanations(!showExplanations)}
                className="w-full inline-flex items-center justify-center bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                {showExplanations ? "Ẩn giải thích" : "Hiện giải thích"}
              </button>
              <button
                onClick={() => navigate(`/quiz/${quizId}`)}
                className="btn-primary w-full inline-flex items-center justify-center"
              >
                Làm lại Quiz
              </button>
              <Link
                to="/classes"
                className="btn-secondary w-full inline-flex items-center justify-center"
              >
                Xem lớp học khác
              </Link>
              <Link
                to="/"
                className="btn-secondary w-full inline-flex items-center justify-center"
              >
                Về trang chủ
              </Link>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Hoàn thành lúc: {new Date(result.completedAt).toLocaleString("vi-VN")}
            </p>
          </div>
        </div>

        {/* Phải: minimap */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 order-1 lg:order-2 lg:self-start sticky top-20 xl:top-4 z-30">
          <div className="card p-4 sm:p-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
            <div className="flex overflow-x-auto snap-x no-scrollbar gap-2 p-4 -m-4 lg:m-0 lg:p-0 lg:grid lg:grid-cols-5 lg:gap-2">
              {displayQuestions.map((q: any, index: number) => {
                const wrong = isQuestionWrongForResult(q);
                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => {
                      const el = document.getElementById(`q-${q.id}`);
                      if (el) {
                        const offset = 100; // Adjust for header
                        const elementPosition = el.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - offset;
                        window.scrollTo({
                          top: offsetPosition,
                          behavior: "smooth"
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
