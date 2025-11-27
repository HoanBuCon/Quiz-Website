import {
  FaRegDotCircle,
  FaRegEdit,
  FaRegHandPointer,
  FaSitemap,
  FaRegClock,
} from "react-icons/fa";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Question, UserAnswer, DragTarget, DragItem } from "../types";
import { buildShortId } from "../utils/share";

// Component trang làm bài trắc nghiệm
const QuizPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]); // Lưu câu hỏi gốc
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [markedQuestions, setMarkedQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizTitle, setQuizTitle] = useState("");
  const [startTime] = useState(Date.now()); // Thời gian bắt đầu làm bài
  const [effectiveQuizId, setEffectiveQuizId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const attemptRef = React.useRef<string | null>(null);
  useEffect(() => { attemptRef.current = attemptId; }, [attemptId]);

  // UI mode: 'default' (nộp bài mới xem kết quả) | 'instant' (xem kết quả ngay)
  const [uiMode, setUiMode] = useState<"default" | "instant">("default");
  const [showModeChooser, setShowModeChooser] = useState<boolean>(false);
  // Shuffle mode: null (chưa chọn) | 'none' (không trộn) | 'random' (trộn ngẫu nhiên)
  const [shuffleMode, setShuffleMode] = useState<null | "none" | "random">(null);
  // Theo dõi xem người dùng đã chọn ui mode chưa
  const [selectedUiMode, setSelectedUiMode] = useState<"default" | "instant" | null>(null);
  // Lưu trạng thái đã xác nhận (reveal) cho các câu hỏi cần nút Xác nhận (text/drag)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  // Theo dõi viewport để render floating nút chuyển đổi chỉ khi >= 1024px (lg)
  const [isLarge, setIsLarge] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );
  // State để theo dõi vị trí focus bằng bàn phím
  // focusedOption: index của đáp án đang focus (-1: không focus, >= 0: index đáp án, 9999: nút Xác nhận)
  const [focusedOption, setFocusedOption] = useState<number>(-1);

  // Hàm trộn mảng (Fisher-Yates shuffle)
  const shuffleArray = <T,>(array: T[]): T[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // Hàm trộn câu hỏi và đáp án
  const shuffleQuestions = (qs: Question[]): Question[] => {
    if (shuffleMode === "none" || shuffleMode === null) return qs;

    const shuffledQuestions = shuffleArray(qs);
    return shuffledQuestions.map((q) => {
      if (q.type === "single" || q.type === "multiple") {
        // Kiểm tra options là mảng string trước khi shuffle
        const opts = q.options;
        if (Array.isArray(opts) && opts.every(o => typeof o === 'string')) {
          return {
            ...q,
            options: shuffleArray(opts as string[]),
          };
        }
      }
      if (q.type === "composite" && (q as any).subQuestions) {
        return {
          ...q,
          subQuestions: (q as any).subQuestions.map((sub: Question) => {
            if (sub.type === "single" || sub.type === "multiple") {
              // Kiểm tra options là mảng string trước khi shuffle
              const subOpts = sub.options;
              if (Array.isArray(subOpts) && subOpts.every(o => typeof o === 'string')) {
                return {
                  ...sub,
                  options: shuffleArray(subOpts as string[]),
                };
              }
            }
            return sub;
          }),
        };
      }
      return q;
    });
  };

  // Load quiz data from backend
  useEffect(() => {
    const loadQuiz = async () => {
      if (!quizId) {
        console.error("Quiz ID not provided");
        navigate("/classes");
        return;
      }

      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          navigate("/");
          return;
        }
        const { QuizzesAPI } = await import("../utils/api");

        // Use direct API call which handles public/share/owner logic in backend
        const found = await QuizzesAPI.getById(quizId, token);

        if (found) {
          setQuizTitle(found.title);
          // Lưu câu hỏi gốc
          const loadedQuestions = found.questions || [];
          setOriginalQuestions(loadedQuestions);
          setQuestions(loadedQuestions);
          setEffectiveQuizId(found.id);
        } else {
          throw new Error("Quiz không tìm thấy");
        }
      } catch (error: any) {
        console.error("Error loading quiz:", error);
        setQuestions([
          {
            id: "error",
            question:
              error?.message?.includes("Forbidden") ||
                error?.message?.includes("Quiz chưa xuất bản")
                ? "Quiz không khả dụng hoặc chưa được chia sẻ"
                : "Quiz không tìm thấy",
            type: "single",
            options: ["Quay lại"],
            correctAnswers: ["Quay lại"],
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadQuiz();
  }, [quizId, navigate]);

  // Tạo QuizAttempt khi đã biết quizId hiệu lực
  useEffect(() => {
    if (!effectiveQuizId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) return;
        const { SessionsAPI } = await import("../utils/api");
        const res = await SessionsAPI.start(effectiveQuizId, token);
        if (!cancelled) setAttemptId(res.attemptId || null);
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [effectiveQuizId]);

  // Gửi endAttempt khi rời trang hoặc reload
  useEffect(() => {
    const sendEnd = async () => {
      const id = attemptRef.current;
      if (!id) return;
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) return;
        const { SessionsAPI } = await import("../utils/api");
        await SessionsAPI.endAttempt(id, token);
      } catch { }
    };
    const handleBeforeUnload = () => { navigator.sendBeacon?.('', new Blob()); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // best-effort end on unmount
      sendEnd();
    };
  }, []);

  // Hỏi người dùng chọn định dạng khi vào trang
  useEffect(() => {
    // Chỉ hiển thị sau khi loading xong và có câu hỏi hợp lệ
    if (!loading && questions.length > 0 && shuffleMode === null && selectedUiMode === null) {
      setShowModeChooser(true);
    }
  }, [loading, questions.length]);

  // Lắng nghe thay đổi kích thước màn hình để quyết định có render floating toggle hay không
  useEffect(() => {
    const onResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Reset focus khi chuyển câu hỏi
  useEffect(() => {
    setFocusedOption(-1);
  }, [currentQuestionIndex]);

  // ======================
  // Keyboard Navigation (arrow keys + Enter)
  // ======================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nếu đang hiển thị mode chooser thì bỏ qua
      if (showModeChooser) return;

      const currentQuestion = questions[currentQuestionIndex];
      if (!currentQuestion) return;

      // Không xử lý nếu đang focus vào input hoặc textarea
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag && ["input", "textarea"].includes(activeTag)) return;

      const totalOptions = (() => {
        if (currentQuestion.type === "composite") {
          const subs = (currentQuestion as any).subQuestions || [];
          return subs.reduce((acc: number, sub: Question) => {
            if (sub.type === "text") return acc + 1; // input box đếm như 1 option
            return acc + (Array.isArray(sub.options) ? sub.options.length : 0);
          }, 0);
        }
        if (currentQuestion.type === "text") return 1; // input box
        return Array.isArray(currentQuestion.options)
          ? currentQuestion.options.length
          : 0;
      })();

      const isLocked = uiMode === "instant" && revealed.has(currentQuestion.id);

      // Xác định có nút Xác nhận hay không
      const hasConfirmButton =
        uiMode === "instant" &&
        ["multiple", "text", "drag", "composite"].includes(
          currentQuestion.type as string
        );

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          handlePrevQuestion();
          break;

        case "ArrowRight":
          e.preventDefault();
          handleNextQuestion();
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedOption((prev) => {
            if (prev === -1) return totalOptions - 1;
            if (prev === 9999) {
              // THÊM: Từ nút Xác nhận lên lại option cuối
              return totalOptions - 1;
            }
            if (prev <= 0) {
              // THÊM: Nếu đang ở option đầu tiên và là text input, blur input
              if (currentQuestion.type === "text") {
                const inputElement = document.querySelector(
                  `input[data-question-id="${currentQuestion.id}"]`
                ) as HTMLInputElement;
                if (inputElement && document.activeElement === inputElement) {
                  inputElement.blur();
                }
              } else if (currentQuestion.type === "composite") {
                // Kiểm tra xem option đầu tiên có phải text input không
                const subs = (currentQuestion as any).subQuestions || [];
                if (subs[0]?.type === "text") {
                  const inputElement = document.querySelector(
                    `input[data-question-id="${subs[0].id}"]`
                  ) as HTMLInputElement;
                  if (inputElement && document.activeElement === inputElement) {
                    inputElement.blur();
                  }
                }
              }
              return prev;
            }

            // THÊM: Blur input nếu đang rời khỏi text input trong composite
            if (currentQuestion.type === "composite") {
              const subs = (currentQuestion as any).subQuestions || [];
              let cumulative = 0;
              for (let i = 0; i < subs.length; i++) {
                const sub = subs[i];
                const subOptionsCount = sub.type === "text" ? 1 : (Array.isArray(sub.options) ? sub.options.length : 0);
                if (prev >= cumulative && prev < cumulative + subOptionsCount && sub.type === "text") {
                  const inputElement = document.querySelector(
                    `input[data-question-id="${sub.id}"]`
                  ) as HTMLInputElement;
                  if (inputElement && document.activeElement === inputElement) {
                    inputElement.blur();
                  }
                }
                cumulative += subOptionsCount;
              }
            }

            return prev - 1;
          });
          break;

        case "ArrowDown":
          e.preventDefault();
          setFocusedOption((prev) => {
            if (prev === -1) return 0; // bắt đầu từ đáp án đầu
            if (prev === totalOptions - 1) {
              if (hasConfirmButton && !isLocked) {
                // THÊM: Blur input nếu đang ở text input cuối cùng
                if (currentQuestion.type === "text") {
                  const inputElement = document.querySelector(
                    `input[data-question-id="${currentQuestion.id}"]`
                  ) as HTMLInputElement;
                  if (inputElement && document.activeElement === inputElement) {
                    inputElement.blur();
                  }
                } else if (currentQuestion.type === "composite") {
                  // Tìm text input cuối cùng trong composite
                  const subs = (currentQuestion as any).subQuestions || [];
                  for (let i = subs.length - 1; i >= 0; i--) {
                    if (subs[i].type === "text") {
                      const inputElement = document.querySelector(
                        `input[data-question-id="${subs[i].id}"]`
                      ) as HTMLInputElement;
                      if (inputElement && document.activeElement === inputElement) {
                        inputElement.blur();
                      }
                      break;
                    }
                  }
                }
                return 9999; // xuống nút Xác nhận
              }
              return prev;
            }
            if (prev === 9999) return prev; // giữ nguyên nếu đang ở nút xác nhận

            // THÊM: Blur input nếu đang rời khỏi text input trong composite
            if (currentQuestion.type === "composite") {
              const subs = (currentQuestion as any).subQuestions || [];
              let cumulative = 0;
              for (let i = 0; i < subs.length; i++) {
                const sub = subs[i];
                const subOptionsCount = sub.type === "text" ? 1 : (Array.isArray(sub.options) ? sub.options.length : 0);
                if (prev >= cumulative && prev < cumulative + subOptionsCount && sub.type === "text") {
                  const inputElement = document.querySelector(
                    `input[data-question-id="${sub.id}"]`
                  ) as HTMLInputElement;
                  if (inputElement && document.activeElement === inputElement) {
                    inputElement.blur();
                  }
                }
                cumulative += subOptionsCount;
              }
            }

            return prev + 1;
          });
          break;

        case "Enter":
        case " ":
        case "Spacebar":
          e.preventDefault();

          if (focusedOption === 9999 && hasConfirmButton && !isLocked) {
            // Bấm Enter trên nút Xác nhận
            markRevealed(currentQuestion.id);
          } else if (focusedOption >= 0 && focusedOption < totalOptions && !isLocked) {
            // Xử lý cho composite
            if (currentQuestion.type === "composite") {
              const subs = (currentQuestion as any).subQuestions || [];
              let cumulativeIndex = 0;

              for (const sub of subs) {
                const subOptionsCount = sub.type === "text" ? 1 : (Array.isArray(sub.options) ? sub.options.length : 0);

                if (focusedOption < cumulativeIndex + subOptionsCount) {
                  const localIndex = focusedOption - cumulativeIndex;

                  if (sub.type === "text") {
                    // Focus vào input box
                    const inputElement = document.querySelector(`input[data-question-id="${sub.id}"]`) as HTMLInputElement;
                    if (inputElement) {
                      inputElement.focus();
                      inputElement.select();
                    }
                  } else if (Array.isArray(sub.options)) {
                    const option = sub.options[localIndex] as string;
                    if (option) handleAnswerSelect(sub.id, option, sub.type as "single" | "multiple");
                  }
                  break;
                }
                cumulativeIndex += subOptionsCount;
              }
            }
            // Xử lý cho text question thông thường
            else if (currentQuestion.type === "text") {
              const inputElement = document.querySelector(`input[data-question-id="${currentQuestion.id}"]`) as HTMLInputElement;
              if (inputElement) {
                inputElement.focus();
                inputElement.select();
              }
            }
            // Xử lý cho single/multiple thông thường
            else {
              const opts = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];
              const option = opts[focusedOption] as string | undefined;
              if (option) handleAnswerSelect(currentQuestion.id, option);
            }
          } else if (focusedOption === -1 && totalOptions > 0) {
            // Chưa chọn gì -> focus đáp án đầu tiên
            setFocusedOption(0);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentQuestionIndex,
    questions,
    showModeChooser,
    focusedOption,
    uiMode,
    revealed,
  ]);


  // Đồng hồ thời gian làm bài
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    // cập nhật ngay lần đầu
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    return () => clearInterval(id);
  }, [startTime]);

  // Xử lý khi người dùng chọn đáp án (cho single/multiple/text)
  const handleAnswerSelect = (
    questionId: string,
    answer: string,
    questionType?: "single" | "multiple" | "text"
  ) => {
    const currentQuestion = questions[currentQuestionIndex];

    // Xác định type: ưu tiên questionType được truyền vào (cho sub-question), fallback về currentQuestion.type
    const typeToCheck = questionType || currentQuestion.type;

    // Nếu đang ở chế độ instant và câu hỏi đã reveal (khoá), không cho chọn lại
    if (uiMode === "instant") {
      // Khoá top-level khi đã reveal
      if (revealed.has(questionId)) return;
      // Trong composite: nếu đang chọn câu con và parent đã reveal thì không cho chọn
      if (
        currentQuestion.type === "composite" &&
        questionId !== currentQuestion.id &&
        revealed.has(currentQuestion.id)
      )
        return;
    }

    setUserAnswers((prev) => {
      const existingAnswer = prev.find((a) => a.questionId === questionId);

      if (!existingAnswer) {
        return [...prev, { questionId, answers: [answer] }];
      }

      if (typeToCheck === "multiple") {
        // Toggle answer for multiple choice questions
        const updatedAnswers = existingAnswer.answers.includes(answer)
          ? existingAnswer.answers.filter((a) => a !== answer)
          : [...existingAnswer.answers, answer];

        return prev.map((a) =>
          a.questionId === questionId ? { ...a, answers: updatedAnswers } : a
        );
      } else {
        // Replace answer for single choice questions
        return prev.map((a) =>
          a.questionId === questionId ? { ...a, answers: [answer] } : a
        );
      }
    });

    // Ở chế độ instant: Single (top-level) sẽ reveal và khoá ngay sau khi chọn lần đầu
    if (uiMode === "instant") {
      const isTopLevel = questionId === currentQuestion.id;
      if (
        isTopLevel &&
        typeToCheck === "single" &&
        currentQuestion.type === "single"
      ) {
        markRevealed(questionId);
      }
    }
  };

  const getCurrentAnswer = (questionId: string) => {
    return userAnswers.find((a) => a.questionId === questionId)?.answers || [];
  };

  // Kiểm tra xem câu hỏi đã được trả lời chưa (cho minimap)
  const isQuestionAnswered = (question: Question): boolean => {
    if (question.type === "drag") {
      // Drag-drop: kiểm tra xem có mapping nào không
      const answer = userAnswers.find((a) => a.questionId === question.id);
      if (!answer) return false;
      const mapping = answer.answers?.[0];
      if (!mapping || typeof mapping !== "object") return false;
      return Object.keys(mapping).length > 0;
    } else if (question.type === "composite") {
      // Composite: kiểm tra tất cả sub-questions đã được trả lời chưa
      const subQuestions = (question as any).subQuestions || [];
      if (subQuestions.length === 0) return false;
      return subQuestions.every((sub: Question) => {
        const subAnswer = getCurrentAnswer(sub.id);
        if (sub.type === "drag") {
          const mapping = userAnswers.find((a) => a.questionId === sub.id)
            ?.answers?.[0];
          return (
            mapping &&
            typeof mapping === "object" &&
            Object.keys(mapping).length > 0
          );
        }
        return subAnswer.length > 0;
      });
    } else {
      // Single/Multiple/Text: kiểm tra length
      return getCurrentAnswer(question.id).length > 0;
    }
  };

  // Trong chế độ "Xem đáp án ngay": xác định câu hỏi đã reveal chưa
  const isQuestionRevealed = (question: Question): boolean => {
    if (uiMode !== "instant") return false;
    if (question.type === "composite") return revealed.has(question.id);
    return revealed.has(question.id);
  };

  // So sánh tập hợp (dùng cho multiple)
  const setsEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    for (const x of b) if (!sa.has(x)) return false;
    return true;
  };

  // Helper: Kiểm tra xem câu trả lời có sai không (không check revealed)
  const isAnswerIncorrect = (question: Question): boolean => {
    if (question.type === "single" || question.type === "multiple") {
      const selected = getCurrentAnswer(question.id) as string[];
      const correct = getCorrectAnswers(question) as string[];
      if (question.type === "single") {
        if (selected.length !== 1) return true;
        return !correct.includes(selected[0]);
      } else {
        return !setsEqual(selected, correct);
      }
    }

    if (question.type === "text") {
      const val = (getCurrentAnswer(question.id)[0] as string) || "";
      return !isTextAnswerCorrect(question, val);
    }

    if (question.type === "drag") {
      const mapping =
        (userAnswers.find((a) => a.questionId === question.id)?.answers?.[0] as
          any) || {};
      const correctMapping = (question.correctAnswers || {}) as Record<
        string,
        string
      >;
      const items =
        ((question.options && (question.options as any).items) as DragItem[]) ||
        [];
      for (const it of items) {
        const u = mapping[it.id];
        const c = correctMapping[it.id];
        if ((u || "") !== (c || "")) return true;
      }
      return false;
    }

    return false;
  };

  // Kiểm tra đúng/sai cho câu hỏi (chỉ dùng khi đã reveal trong chế độ instant)
  const isQuestionWrong = (question: Question): boolean => {
    if (uiMode !== "instant") return false;
    if (!isQuestionRevealed(question)) return false;

    if (question.type === "composite") {
      const subs = (question as any).subQuestions || [];
      if (!Array.isArray(subs) || subs.length === 0) return false;
      // Đúng khi tất cả câu con đúng; sai nếu có ít nhất 1 câu con sai
      for (const sub of subs as Question[]) {
        // Với composite, khi parent đã reveal thì check luôn sub mà không cần sub phải reveal riêng
        if (isAnswerIncorrect(sub)) return true;
      }
      return false;
    }

    return isAnswerIncorrect(question);
  };

  // Helpers
  const getCorrectAnswers = (q: Question): string[] => {
    if (q.type === "drag" || q.type === "composite") return [] as string[];
    const ca = Array.isArray(q.correctAnswers)
      ? (q.correctAnswers as string[])
      : [];
    return ca;
  };

  const isRevealed = (qid: string) => uiMode === "instant" && revealed.has(qid);
  const isChoiceReveal = (
    q: Question,
    _selected: string[],
    forceReveal: boolean = false
  ) => uiMode === "instant" && (forceReveal || revealed.has(q.id));

  const markRevealed = (qid: string) =>
    setRevealed((prev) => new Set(prev).add(qid));
  const unmarkRevealed = (qid: string) =>
    setRevealed((prev) => {
      const n = new Set(prev);
      n.delete(qid);
      return n;
    });

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const isTextAnswerCorrect = (q: Question, value: string) => {
    const ca = Array.isArray(q.correctAnswers)
      ? (q.correctAnswers as string[])
      : [];
    const norm = (s: string) => (s || "").trim().toLowerCase();
    return ca.some((ans) => norm(ans) === norm(value));
  };

  // Navigate to next/previous question
  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  // Submit answers
  const handleSubmit = async () => {
    if (window.confirm("Bạn có chắc chắn muốn nộp bài?")) {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập để nộp bài.");
          return;
        }
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        const answersMap = userAnswers.reduce((acc, answer) => {
          const v: any = answer.answers;
          acc[answer.questionId] =
            Array.isArray(v) && typeof v[0] === "object" ? v[0] : v;
          return acc;
        }, {} as Record<string, any>);
        const { SessionsAPI } = await import("../utils/api");
        const qid = effectiveQuizId || quizId!;
        const created = await SessionsAPI.submit(
          { quizId: qid, answers: answersMap, timeSpent, attemptId: attemptId || undefined },
          token
        );
        try {
          const order = questions.map((q) => q.id);
          const key = `quizOrder:${qid}`;
          sessionStorage.setItem(key, JSON.stringify({ order, ts: Date.now() }));
        } catch { }
        navigate(`/results/${qid}`, { state: { questionOrder: questions.map((q) => q.id) } });
      } catch (e) {
        console.error("Submit failed:", e);
        alert("Có lỗi xảy ra khi nộp bài.");
      }
    }
  };

  // Render error state
  if (questions[0]?.id === "error") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {questions[0].question}
          </h2>
          <button onClick={() => navigate("/classes")} className="btn-primary">
            Quay lại danh sách lớp học
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading) {
    const Spinner = require("../components/Spinner").default;
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex items-center justify-center">
        <Spinner size={48} />
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Guard clause: Check if currentQuestion exists
  if (!currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Không tìm thấy câu hỏi hoặc quiz không có câu hỏi nào
          </h2>
          <button onClick={() => navigate("/classes")} className="btn-primary">
            Quay lại danh sách lớp học
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Top headers row: left = title+timer, right = submit button */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,20rem] gap-4 lg:gap-8 mb-4 sm:mb-6 items-stretch">
        {/* Left header: Title + Timer */}
        <div className="flex h-full flex-row items-center justify-between gap-2 min-w-0">
          <h1 className="flex-1 min-w-0 truncate text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {quizTitle}
          </h1>
          <div className="flex items-center gap-2 px-3 rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 w-fit h-full self-stretch shrink-0 whitespace-nowrap">
            <FaRegClock className="w-4 h-4 shrink-0" />
            <span className="text-sm font-mono font-bold">{formatElapsed(elapsed)}</span>
          </div>
        </div>
        {/* Right header: Submit button (no wrapper div) */}
        <div className="flex w-full">
          <button
            onClick={handleSubmit}
            className="btn-primary h-full w-full text-sm sm:text-base inline-flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Nộp bài</span>
          </button>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* Left Section - Main Content */}
        <div className="flex-1 min-w-0 order-2 lg:order-1">
          {/* Question */}
          <div className="group card p-4 sm:p-6 hover:shadow-2xl transition-all duration-300 border-l-4 border-l-stone-400 dark:border-l-gray-600 hover:border-l-blue-500 dark:hover:border-l-blue-500">
            {/* Question number */}
            <div className="flex flex-row justify-between items-start mb-4 gap-3 sm:gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Câu {currentQuestionIndex + 1}/{questions.length} (ID:{" "}
                  {currentQuestion.id})
                </span>
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {currentQuestion.type === "single"
                    ? "Chọn một đáp án"
                    : currentQuestion.type === "multiple"
                      ? "Chọn nhiều đáp án"
                      : currentQuestion.type === "drag"
                        ? "Kéo thả đáp án vào nhóm tương ứng"
                        : currentQuestion.type === "composite"
                          ? "Câu hỏi gồm nhiều câu hỏi con"
                          : "Điền đáp án"}
                </span>
              </div>
              <button
                onClick={() => {
                  setMarkedQuestions((prev) =>
                    prev.includes(currentQuestion.id)
                      ? prev.filter((id) => id !== currentQuestion.id)
                      : [...prev, currentQuestion.id]
                  );
                }}
                className={`text-[11px] md:text-sm px-2 md:px-3 py-1 rounded-full leading-tight transition-colors w-auto md:w-fit max-w-[120px] md:max-w-none overflow-hidden text-ellipsis whitespace-nowrap min-h-[1.75rem] max-h-[1.75rem] md:min-h-[2rem] md:max-h-[2rem] flex items-center shrink-0 ${markedQuestions.includes(currentQuestion.id)
                  ? "bg-yellow-500 text-white hover:bg-yellow-600"
                  : "bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
              >
                {markedQuestions.includes(currentQuestion.id)
                  ? "Đã đánh dấu"
                  : "Xem lại câu này"}
              </button>
            </div>

            {/* Question text */}
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 sm:mb-6 text-selectable">
              {currentQuestion.question}
            </h2>
            {/* Question image nếu có */}
            {currentQuestion.questionImage && (
              <div className="mb-4 sm:mb-6">
                <img
                  src={currentQuestion.questionImage}
                  alt="Question"
                  className="w-full h-auto rounded-lg shadow border border-gray-200 dark:border-gray-600 object-contain"
                  style={{
                    display: "block",
                    width: "100%",
                    objectFit: "contain",
                    margin: "0 auto",
                  }}
                />
              </div>
            )}

            {/* Divider */}
            <div className="w-full flex items-center my-4 sm:my-6">
              <div className="flex-1 border-t border-gray-400 dark:border-gray-600"></div>
              <span className="px-3 flex items-center justify-center">
                {currentQuestion.type === "single" ||
                  currentQuestion.type === "multiple" ? (
                  <FaRegDotCircle className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                ) : currentQuestion.type === "text" ? (
                  <FaRegEdit className="w-5 h-5 text-green-500 dark:text-green-400" />
                ) : currentQuestion.type === "drag" ? (
                  <FaRegHandPointer className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                ) : currentQuestion.type === "composite" ? (
                  <FaSitemap className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                ) : (
                  <FaRegEdit className="w-5 h-5 text-green-500 dark:text-green-400" />
                )}
              </span>
              <div className="flex-1 border-t border-gray-400 dark:border-gray-600"></div>
            </div>

            {/* Answer options */}
            <div className="space-y-2 sm:space-y-3">
              {currentQuestion.type === "text" && (
                <div className="space-y-2">
                  {/* === BẮT ĐẦU SỬA MỤC 1 === */}
                  {(() => {
                    // Định nghĩa các style state (Trạng thái)
                    const stateCorrect = "border-green-600 bg-green-500 text-white dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
                    const stateWrong = "border-red-700 bg-red-600 text-white dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
                    const stateNormal = "border-gray-400 dark:border-gray-600";

                    // Định nghĩa các style focus (Trỏ)
                    const focusCorrect = "border-green-600 shadow-[0_0_18px_rgba(22,163,74,0.7)] dark:border-green-500 dark:shadow-[0_0_18px_rgba(34,197,94,0.7)]";
                    const focusWrong = "border-red-700 shadow-[0_0_18px_rgba(185,28,28,0.7)] dark:border-red-500 dark:shadow-[0_0_18px_rgba(239,68,68,0.7)]";
                    const focusNormal = "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,1)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]";

                    const isFocused = focusedOption === 0;
                    const revealed = isRevealed(currentQuestion.id);
                    const isCorrect = isTextAnswerCorrect(currentQuestion, (getCurrentAnswer(currentQuestion.id)[0] as string) || "");

                    let computedClassName = "";
                    if (isFocused) {
                      if (revealed) {
                        computedClassName = isCorrect ? `${stateCorrect} ${focusCorrect}` : `${stateWrong} ${focusWrong}`;
                      } else {
                        // Khi focus mà chưa reveal, dùng stateNormal (chỉ border) + focusNormal
                        computedClassName = `${stateNormal} ${focusNormal}`;
                      }
                    } else {
                      // Khi không focus
                      computedClassName = revealed ? (isCorrect ? stateCorrect : stateWrong) : stateNormal;
                    }

                    return (
                      <input
                        type="text"
                        data-question-id={currentQuestion.id}
                        disabled={revealed}
                        className={`w-full p-3 rounded-lg text-sm sm:text-base transition-colors duration-200 dark:bg-gray-700 dark:text-gray-100 border ${computedClassName}`}
                        placeholder="Nhập câu trả lời của bạn"
                        value={
                          (getCurrentAnswer(currentQuestion.id)[0] || "") as string
                        }
                        onChange={(e) =>
                          handleAnswerSelect(currentQuestion.id, e.target.value)
                        }
                      />
                    );
                  })()}
                  {/* === KẾT THÚC SỬA MỤC 1 === */}
                  {uiMode === "instant" && isRevealed(currentQuestion.id) && (
                    <TextRevealPanel
                      question={currentQuestion}
                      userValue={
                        (getCurrentAnswer(currentQuestion.id)[0] as string) ||
                        ""
                      }
                    />
                  )}
                </div>
              )}
              {currentQuestion.type !== "text" &&
                currentQuestion.type !== "drag" &&
                currentQuestion.type !== "composite" &&
                Array.isArray(currentQuestion.options) && (
                  <>
                    {currentQuestion.options.map((option, index) => {
                      const optionImage =
                        currentQuestion.optionImages &&
                        currentQuestion.optionImages[option];
                      const selected = getCurrentAnswer(currentQuestion.id);
                      const shouldReveal = isChoiceReveal(
                        currentQuestion,
                        selected
                      );
                      const isCorrect =
                        getCorrectAnswers(currentQuestion).includes(option);
                      const isChosen = selected.includes(option);
                      const locked =
                        uiMode === "instant" &&
                        revealed.has(currentQuestion.id);
                      const isFocused = focusedOption === index;
                      const base =
                        "w-full p-3 sm:p-4 text-left rounded-lg transition-all duration-200 border text-sm sm:text-base disabled:cursor-not-allowed";
                      const chosenStyle_Base =
                        "bg-primary-100 text-primary-900 border-primary-600 dark:bg-primary-900/50 dark:text-primary-100 dark:border-primary-400";
                      const chosenShadow = "shadow-md shadow-primary-500/20 dark:shadow-md dark:shadow-primary-500/25";
                      const normalStyle =
                        "bg-white text-gray-800 border-gray-400 hover:border-gray-500 hover:bg-stone-100 hover:shadow-md hover:shadow-gray-400/15 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-700/50 dark:hover:shadow-md dark:hover:shadow-gray-400/20";
                      const correctStyle_Base =
                        "bg-green-500 text-white border-green-600 dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
                      const correctShadow = "shadow-md shadow-green-500/20";
                      const wrongChosenStyle_Base =
                        "bg-red-600 text-white border-red-700 dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
                      const wrongChosenShadow = "shadow-md shadow-red-600/20";
                      const focusNormal =
                        "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,0.7)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]";
                      const focusChosen =
                        "border-primary-600 shadow-[0_0_18px_rgba(59,130,246,0.7)] dark:border-primary-400 dark:shadow-[0_0_18px_rgba(96,165,250,0.7)]";
                      const focusCorrect =
                        "border-green-600 shadow-[0_0_18px_rgba(22,163,74,0.7)] dark:border-green-500 dark:shadow-[0_0_18px_rgba(34,197,94,0.7)]";
                      const focusWrong =
                        "border-red-700 shadow-[0_0_18px_rgba(185,28,28,0.7)] dark:border-red-500 dark:shadow-[0_0_18px_rgba(239,68,68,0.7)]";

                      // THÊM LOGIC MỚI NÀY
                      let computedClassName = "";
                      if (shouldReveal) {
                        if (isCorrect) {
                          computedClassName = isFocused ? `${correctStyle_Base} ${focusCorrect}` : `${correctStyle_Base} ${correctShadow}`;
                        } else if (isChosen) {
                          computedClassName = isFocused ? `${wrongChosenStyle_Base} ${focusWrong}` : `${wrongChosenStyle_Base} ${wrongChosenShadow}`;
                        } else {
                          computedClassName = isFocused ? `${normalStyle} ${focusNormal}` : normalStyle;
                        }
                      } else {
                        if (isChosen) {
                          computedClassName = isFocused ? `${chosenStyle_Base} ${focusChosen}` : `${chosenStyle_Base} ${chosenShadow}`;
                        } else {
                          computedClassName = isFocused ? `${normalStyle} ${focusNormal}` : normalStyle;
                        }
                      }

                      return (
                        <button
                          key={index}
                          disabled={locked}
                          onClick={() =>
                            handleAnswerSelect(currentQuestion.id, option)
                          }
                          className={`${base} ${computedClassName}`}
                        >
                          <div className="flex flex-col items-start gap-2 w-full">
                            <span className="flex items-center gap-2">
                              {shouldReveal && isCorrect && (
                                <svg
                                  className="w-4 h-4 text-current dark:text-emerald-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                              {shouldReveal && isChosen && !isCorrect && (
                                <svg
                                  className="w-4 h-4 text-current dark:text-red-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              )}
                              <span className="text-selectable">
                                {String.fromCharCode(65 + index)}. {option}
                              </span>
                            </span>
                            {optionImage && (
                              <img
                                src={optionImage}
                                alt={`Option ${String.fromCharCode(
                                  65 + index
                                )}`}
                                className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600 object-contain"
                                style={{
                                  display: "block",
                                  width: "100%",
                                  objectFit: "contain",
                                  margin: "0.25rem 0 0 0",
                                }}
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              {currentQuestion.type === "drag" && (
                <DragDropQuestion
                  key={currentQuestion.id}
                  question={currentQuestion}
                  value={
                    (userAnswers.find(
                      (a) => a.questionId === currentQuestion.id
                    )?.answers?.[0] as any) || {}
                  }
                  onChange={(mapping) => {
                    setUserAnswers((prev) => {
                      const existing = prev.find(
                        (a) => a.questionId === currentQuestion.id
                      );
                      if (!existing)
                        return [
                          ...prev,
                          {
                            questionId: currentQuestion.id,
                            answers: [mapping as any],
                          },
                        ];
                      return prev.map((a) =>
                        a.questionId === currentQuestion.id
                          ? { ...a, answers: [mapping as any] }
                          : a
                      );
                    });
                  }}
                  reveal={isRevealed(currentQuestion.id)}
                  correctMapping={(currentQuestion.correctAnswers as any) || {}}
                />
              )}
              {currentQuestion.type === "composite" &&
                Array.isArray((currentQuestion as any).subQuestions) && (
                  <div className="space-y-4">
                    {(currentQuestion as any).subQuestions.map(
                      (sub: Question, idx: number) => {
                        const parentRevealed = isRevealed(currentQuestion.id);
                        return (
                          <div
                            key={sub.id}
                            className="border border-gray-400 rounded-lg p-4 bg-gray-200/40 dark:border-gray-600 dark:bg-gray-900/30 transition-colors duration-200"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Câu hỏi con {idx + 1}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {sub.type === "text"
                                  ? "Tự luận"
                                  : sub.type === "single"
                                    ? "Chọn 1"
                                    : "Chọn nhiều"}
                              </span>
                            </div>
                            <div className="font-medium mb-3 text-gray-900 dark:text-gray-100 text-selectable">
                              {sub.question}
                            </div>
                            {sub.type === "text" && (
                              <div className="space-y-2">
                                {/* === BẮT ĐẦU SỬA MỤC 3 === */}
                                {(() => {
                                  // Định nghĩa các style state
                                  const stateCorrect = "border-green-600 bg-green-500 text-white dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
                                  const stateWrong = "border-red-700 bg-red-600 text-white dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
                                  const stateNormal = "border-gray-400"; // class gốc

                                  // Định nghĩa các style focus (Trỏ)
                                  const focusCorrect = "border-green-600 shadow-[0_0_18px_rgba(22,163,74,0.7)] dark:border-green-500 dark:shadow-[0_0_18px_rgba(34,197,94,0.7)]";
                                  const focusWrong = "border-red-700 shadow-[0_0_18px_rgba(185,28,28,0.7)] dark:border-red-500 dark:shadow-[0_0_18px_rgba(239,68,68,0.7)]";
                                  const focusNormal = "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,1)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]";

                                  // Tính globalIndex để xác định focus
                                  const isFocused = (() => {
                                    const subs = (currentQuestion as any).subQuestions || [];
                                    let cumulative = 0;
                                    for (let i = 0; i < idx; i++) {
                                      const prevSub = subs[i];
                                      cumulative += prevSub.type === "text"
                                        ? 1
                                        : (Array.isArray(prevSub.options) ? prevSub.options.length : 0);
                                    }
                                    return focusedOption === cumulative;
                                  })();

                                  const revealed = parentRevealed;
                                  const isCorrect = isTextAnswerCorrect(sub, (getCurrentAnswer(sub.id)[0] as string) || "");

                                  let computedClassName = "";
                                  if (isFocused) {
                                    if (revealed) {
                                      computedClassName = isCorrect ? `${stateCorrect} ${focusCorrect}` : `${stateWrong} ${focusWrong}`;
                                    } else {
                                      computedClassName = `${stateNormal} ${focusNormal}`;
                                    }
                                  } else {
                                    computedClassName = revealed ? (isCorrect ? stateCorrect : stateWrong) : stateNormal;
                                  }

                                  return (
                                    <input
                                      type="text"
                                      data-question-id={sub.id}
                                      disabled={revealed}
                                      className={`w-full p-3 rounded-lg bg-white text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white border ${computedClassName}`}
                                      placeholder="Nhập câu trả lời của bạn"
                                      value={
                                        (getCurrentAnswer(sub.id)[0] ||
                                          "") as string
                                      }
                                      onChange={(e) =>
                                        handleAnswerSelect(
                                          sub.id,
                                          e.target.value,
                                          "text"
                                        )
                                      }
                                    />
                                  );
                                })()}
                                {/* === KẾT THÚC SỬA MỤC 3 === */}
                                {uiMode === "instant" && parentRevealed && (
                                  <TextRevealPanel
                                    question={sub}
                                    userValue={
                                      (getCurrentAnswer(sub.id)[0] as string) ||
                                      ""
                                    }
                                  />
                                )}
                              </div>
                            )}
                            {sub.type !== "text" &&
                              sub.type !== "drag" &&
                              Array.isArray(sub.options) && (
                                <div className="space-y-2">
                                  {sub.options.map((opt, oidx) => {
                                    const selected = getCurrentAnswer(sub.id);
                                    const shouldReveal = isChoiceReveal(
                                      sub,
                                      selected,
                                      parentRevealed
                                    );
                                    const isCorrect = (
                                      Array.isArray(sub.correctAnswers)
                                        ? (sub.correctAnswers as string[])
                                        : []
                                    ).includes(opt);
                                    const isChosen = selected.includes(opt);

                                    // THÊM: Tính toán globalIndex để xác định focus
                                    const globalIndex = (() => {
                                      const subs = (currentQuestion as any).subQuestions || [];
                                      let cumulative = 0;
                                      // Cộng dồn số options của các sub-question trước đó
                                      for (let i = 0; i < idx; i++) {
                                        const prevSub = subs[i];
                                        cumulative += prevSub.type === "text"
                                          ? 1
                                          : (Array.isArray(prevSub.options) ? prevSub.options.length : 0);
                                      }
                                      // Cộng thêm index của option hiện tại trong sub-question này
                                      return cumulative + oidx;
                                    })();

                                    // THÊM: Kiểm tra xem option này có đang được focus không
                                    const isFocused = focusedOption === globalIndex;

                                    const base =
                                      "w-full p-3 text-left rounded-lg border transition-all duration-200 disabled:cursor-not-allowed";
                                    const chosenStyle_Base =
                                      "bg-primary-100 border-primary-600 text-primary-900 dark:bg-primary-900/50 dark:text-primary-100 dark:border-primary-400";
                                    const chosenShadow = "shadow-md shadow-primary-500/20 dark:shadow-md dark:shadow-primary-500/25";
                                    const normalStyle =
                                      "bg-white border-gray-400 text-gray-900 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700";
                                    const correctStyle_Base =
                                      "bg-green-500 text-white border-green-600 dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
                                    const correctShadow = "shadow-md shadow-green-500/20";
                                    const wrongChosenStyle_Base =
                                      "bg-red-600 text-white border-red-700 dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
                                    const wrongChosenShadow = "shadow-md shadow-red-600/20";

                                    {/* === BẮT ĐẦU SỬA MỤC 4 === */ }
                                    {/* Định nghĩa các style focus (Trỏ) */ }
                                    const focusChosen = "border-primary-600 shadow-[0_0_18px_rgba(59,130,246,0.7)] dark:border-primary-400 dark:shadow-[0_0_18px_rgba(96,165,250,0.7)]";
                                    const focusCorrect = "border-green-600 shadow-[0_0_18px_rgba(22,163,74,0.7)] dark:border-green-500 dark:shadow-[0_0_18px_rgba(34,197,94,0.7)]";
                                    const focusWrong = "border-red-700 shadow-[0_0_18px_rgba(185,28,28,0.7)] dark:border-red-500 dark:shadow-[0_0_18px_rgba(239,68,68,0.7)]";
                                    const focusNormal = "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,0.7)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]";

                                    {/* Tính toán className cuối cùng */ }
                                    let computedClassName = "";
                                    if (shouldReveal) {
                                      if (isCorrect) {
                                        computedClassName = isFocused ? `${correctStyle_Base} ${focusCorrect}` : `${correctStyle_Base} ${correctShadow}`;
                                      } else if (isChosen) {
                                        computedClassName = isFocused ? `${wrongChosenStyle_Base} ${focusWrong}` : `${wrongChosenStyle_Base} ${wrongChosenShadow}`;
                                      } else {
                                        computedClassName = isFocused ? `${normalStyle} ${focusNormal}` : normalStyle;
                                      }
                                    } else {
                                      if (isChosen) {
                                        computedClassName = isFocused ? `${chosenStyle_Base} ${focusChosen}` : `${chosenStyle_Base} ${chosenShadow}`;
                                      } else {
                                        computedClassName = isFocused ? `${normalStyle} ${focusNormal}` : normalStyle;
                                      }
                                    }

                                    return (
                                      <button
                                        key={oidx}
                                        disabled={parentRevealed}
                                        onClick={() =>
                                          handleAnswerSelect(
                                            sub.id,
                                            opt,
                                            sub.type as "single" | "multiple"
                                          )
                                        }
                                        className={`${base} ${computedClassName}`}
                                      >
                                        {/* === KẾT THÚC SỬA MỤC 4 === */}
                                        <div className="text-left w-full flex items-center gap-2">
                                          {shouldReveal && isCorrect && (
                                            <svg
                                              className="w-4 h-4 text-current dark:text-emerald-400"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5 13l4 4L19 7"
                                              />
                                            </svg>
                                          )}
                                          {shouldReveal &&
                                            isChosen &&
                                            !isCorrect && (
                                              <svg
                                                className="w-4 h-4 text-current dark:text-red-400"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M6 18L18 6M6 6l12 12"
                                                />
                                              </svg>
                                            )}
                                          <span className="font-medium text-selectable">
                                            {String.fromCharCode(65 + oidx)}.
                                          </span>{" "}
                                          <span className="text-selectable">{opt}</span>
                                        </div>
                                      </button>
                                    );


                                  })}
                                </div>
                              )}
                            {sub.type === "drag" && (
                              <DragDropQuestion
                                key={sub.id}
                                question={sub}
                                value={
                                  (userAnswers.find(
                                    (a) => a.questionId === sub.id
                                  )?.answers?.[0] as any) || {}
                                }
                                onChange={(mapping) => {
                                  setUserAnswers((prev) => {
                                    const existing = prev.find(
                                      (a) => a.questionId === sub.id
                                    );
                                    if (!existing)
                                      return [
                                        ...prev,
                                        {
                                          questionId: sub.id,
                                          answers: [mapping as any],
                                        },
                                      ];
                                    return prev.map((a) =>
                                      a.questionId === sub.id
                                        ? { ...a, answers: [mapping as any] }
                                        : a
                                    );
                                  });
                                }}
                                reveal={parentRevealed}
                                correctMapping={
                                  (sub.correctAnswers as any) || {}
                                }
                              />
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
            </div>
          </div>

          {/* Navigation buttons */}
          <div className="mt-4 sm:mt-6 w-full grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-stretch">
            {/* Confirm (instant mode) - first row full width on mobile */}
            {uiMode === "instant" &&
              (currentQuestion.type === "multiple" ||
                currentQuestion.type === "text" ||
                currentQuestion.type === "drag" ||
                currentQuestion.type === "composite") && (
                <button
                  onClick={() => markRevealed(currentQuestion.id)}
                  disabled={isRevealed(currentQuestion.id)}
                  className={`
                    col-span-2 w-full sm:col-span-auto sm:order-2 sm:flex-1
                    text-base sm:text-lg px-4 py-2 sm:px-5 sm:py-2 min-w-[110px]
                    rounded-lg font-medium border-2
                    border-blue-500 dark:border-blue-400
                    bg-gray-50 dark:bg-blue-900/40
                    text-blue-600 dark:text-blue-300
                    hover:bg-blue-50 dark:hover:bg-blue-800/60
                    hover:text-blue-700 dark:hover:text-blue-200
                    hover:shadow-md hover:shadow-blue-400/25 dark:hover:shadow-blue-900/40
                    transition-all duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed
                    ${focusedOption === 9999
                      ? "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,1)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]"
                      : ""
                    }
                  `}
                >
                  Xác nhận
                </button>
              )}

            {/* Prev - second row, left on mobile; first on desktop */}
            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="btn-secondary col-span-1 sm:col-span-auto sm:order-1 sm:flex-1 flex items-center justify-center gap-2 text-base sm:text-lg px-4 py-2 sm:px-5 sm:py-2 min-w-[110px]"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Câu trước
            </button>

            {/* Next - second row, right on mobile; last on desktop */}
            <button
              onClick={handleNextQuestion}
              disabled={currentQuestionIndex === questions.length - 1}
              className="btn-secondary col-span-1 sm:col-span-auto sm:order-3 sm:flex-1 flex items-center justify-center gap-2 text-base sm:text-lg px-4 py-2 sm:px-5 sm:py-2 min-w-[110px]"
            >
              Câu sau
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Right Section - Sidebar */}
        <div className="w-full lg:w-80 lg:flex-shrink-0 order-1 lg:order-2">
          <div className="card p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                Danh sách câu hỏi
              </h3>
              {/* Nút chuyển đổi chế độ cho màn hình < 1024px */}
              <div className="minimap-toggle-wrap block lg:hidden ml-2 self-stretch h-auto md:h-auto">
                <button
                  onClick={() =>
                    setUiMode((prev) =>
                      prev === "default" ? "instant" : "default"
                    )
                  }
                  className="inline-flex items-center justify-center gap-1 h-full min-h-full py-0 leading-none px-2 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600 whitespace-nowrap box-border"
                  title="Chuyển đổi định dạng"
                >
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0 block leading-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <polyline
                      points="23 4 23 10 17 10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline
                      points="1 20 1 14 7 14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-medium text-[11px] h-[14px] leading-[14px] flex items-center">
                    {uiMode === "instant"
                      ? "Định dạng: Xem ngay"
                      : "Định dạng: Mặc định"}
                  </span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-1 sm:gap-2">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`p-1 sm:p-2 text-center rounded-lg transition-all duration-200 border-2 text-xs sm:text-sm
                    ${index === currentQuestionIndex
                      ? "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 dark:text-primary-400 dark:bg-primary-900/20 dark:shadow-lg dark:shadow-primary-500/25"
                      : uiMode === "instant" && isQuestionWrong(question)
                        ? "bg-red-600 text-white font-medium border border-transparent shadow-md shadow-red-600/20 dark:bg-red-900/40 dark:text-red-400 dark:border-red-500"
                        : markedQuestions.includes(question.id)
                          ? "bg-yellow-500 text-white font-medium border-yellow-500 shadow-md shadow-yellow-500/20 dark:text-yellow-400 dark:bg-yellow-900/20 dark:shadow-md dark:shadow-yellow-500/20"
                          : isQuestionAnswered(question)
                            ? "bg-green-500 text-white font-medium border-green-500 shadow-md shadow-green-500/20 dark:text-green-400 dark:bg-green-900/20 dark:shadow-md dark:shadow-green-500/20"
                            : "bg-gray-100 text-gray-800 border-gray-100 hover:bg-gray-200 hover:border-gray-200 hover:shadow-md hover:shadow-gray-400/15 dark:border-gray-600 dark:text-gray-400 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:shadow-md dark:hover:shadow-gray-400/20"
                    }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6 sm:mt-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Tiến độ làm bài:{" "}
            {questions.filter((q) => isQuestionAnswered(q)).length}/
            {questions.length} câu
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {Math.round(
              (questions.filter((q) => isQuestionAnswered(q)).length /
                questions.length) *
              100
            )}
            %
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div
            className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
            style={{
              width: `${(questions.filter((q) => isQuestionAnswered(q)).length /
                questions.length) *
                100
                }%`,
            }}
          ></div>
        </div>
      </div>
      {/* Floating switch mode button for >=1024px - chỉ render khi viewport >= 1024px */}
      {isLarge && (
        <button
          onClick={() =>
            setUiMode((prev) => (prev === "default" ? "instant" : "default"))
          }
          className="hidden lg:flex fixed bottom-24 right-6 z-40 items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all duration-200 bg-white/90 dark:bg-gray-800/80 backdrop-blur border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-800"
          title="Chuyển đổi định dạng"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <polyline
              points="23 4 23 10 17 10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="1 20 1 14 7 14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-medium text-sm">
            {uiMode === "instant"
              ? "Định dạng: Xem ngay"
              : "Định dạng: Mặc định"}
          </span>
        </button>
      )}

      {/* Mode chooser dialog */}
      {showModeChooser && (
        <div className="fixed inset-0 z-50 p-4 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg sm:max-w-lg md:max-w-2xl overflow-hidden overflow-y-auto max-h-[90vh] rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 dark:from-blue-900 dark:via-slate-900 dark:to-slate-950 shadow-2xl animate-slideUp overscroll-contain">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
            {/* Overlay pattern - pattern chấm */}
            <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_#fff_1px,_transparent_0)] bg-[size:24px_24px] rounded-2xl pointer-events-none"></div>

            {/* Header - Chọn định dạng */}
            <div className="relative px-4 pt-4 pb-3 sm:px-4 sm:pt-4 sm:pb-3 md:px-6 md:pt-6 md:pb-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 md:w-14 md:h-14 rounded-full bg-white/10 backdrop-blur mb-3 shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h4 className="text-xl md:text-2xl font-bold text-white mb-2">
                  Chọn định dạng làm bài
                </h4>
                <p className="text-xs md:text-sm text-blue-100 dark:text-blue-200">
                  Bạn có thể thay đổi lại bất cứ lúc nào trong quá trình làm bài
                </p>
              </div>
            </div>

            {/* Options - Định dạng */}
            <div className="relative px-4 pb-4 sm:px-4 sm:pb-4 md:px-6 md:pb-6 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
              <button
                onClick={() => setSelectedUiMode("default")}
                className={`group relative overflow-hidden md:min-h-[144px] w-full rounded-xl px-3 py-2 md:p-5 text-left bg-white dark:bg-white/5 border border-white/20 transition-all duration-200 ease-in-out ${selectedUiMode === "default"
                  ? "ring-2 ring-gray-300 dark:ring-white/30 shadow-xl shadow-gray-400/30 dark:shadow-lg dark:shadow-white/10"
                  : "hover:border-white/30 dark:hover:border-white/30"
                  }`}
              >
                {/* Background overlay khi được chọn - Dark mode */}
                <div className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 ${selectedUiMode === "default" ? "opacity-100" : "opacity-0"
                  } hidden dark:block bg-gradient-to-br from-slate-700 to-gray-800`}></div>
                {/* Pattern overlay khi được chọn */}
                {selectedUiMode === "default" && (
                  <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none"></div>
                )}
                {/* Selected indicator */}
                {selectedUiMode === "default" && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center shadow-md">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="relative flex flex-col justify-start md:h-full md:justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                      <svg
                        className="w-5 h-5 md:w-6 md:h-6 text-blue-600 dark:text-blue-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm md:text-base mb-0 md:mb-1 text-gray-900 dark:text-gray-50">
                        Định dạng mặc định
                      </div>
                    </div>
                  </div>
                  <p className="hidden md:block text-xs md:text-sm leading-relaxed text-gray-600 dark:text-gray-200">
                    Làm bài bình thường và xem kết quả sau khi nộp
                  </p>
                </div>
              </button>

              <button
                onClick={() => setSelectedUiMode("instant")}
                className={`group relative overflow-hidden md:min-h-[144px] w-full rounded-xl px-3 py-2 md:p-5 text-left bg-white dark:bg-white/5 border border-white/20 transition-all duration-200 ease-in-out ${selectedUiMode === "instant"
                  ? "ring-2 ring-gray-300 dark:ring-white/30 shadow-xl shadow-gray-400/30 dark:shadow-lg dark:shadow-white/10"
                  : "hover:border-white/30 dark:hover:border-white/30"
                  }`}
              >
                {/* Background overlay khi được chọn - Dark mode */}
                <div className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 ${selectedUiMode === "instant" ? "opacity-100" : "opacity-0"
                  } hidden dark:block bg-gradient-to-br from-slate-700 to-gray-800`}></div>
                {/* Pattern overlay khi được chọn */}
                {selectedUiMode === "instant" && (
                  <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none"></div>
                )}
                {/* Selected indicator */}
                {selectedUiMode === "instant" && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center shadow-md">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="relative flex flex-col justify-start md:h-full md:justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/40">
                      <svg
                        className="w-5 h-5 md:w-6 md:h-6 text-purple-600 dark:text-purple-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm md:text-base mb-0 md:mb-1 text-gray-900 dark:text-gray-50">
                        Xem đáp án ngay
                      </div>
                    </div>
                  </div>
                  <p className="hidden md:block text-xs md:text-sm leading-relaxed text-gray-600 dark:text-gray-200">
                    Chọn là biết đúng/sai ngay; điền/kéo thả có nút Xác nhận
                  </p>
                </div>
              </button>
            </div>

            {/* Separator */}
            <div className="relative py-4 px-4 md:py-6 md:px-6">
              <div className="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            </div>

            {/* Header - Trộn câu hỏi */}
            <div className="relative px-4 pb-3 md:px-6 md:pb-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 md:w-14 md:h-14 rounded-full bg-white/10 backdrop-blur mb-3 shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
                <h4 className="text-xl md:text-2xl font-bold text-white mb-2">
                  Trộn câu hỏi
                </h4>
                <p className="text-xs md:text-sm text-blue-100 dark:text-blue-200">
                  Chọn cách hiển thị câu hỏi và đáp án trong bài thi
                </p>
              </div>
            </div>

            {/* Options - Trộn */}
            <div className="relative px-4 pb-4 sm:px-4 sm:pb-4 md:px-6 md:pb-6 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4">
              <button
                onClick={() => setShuffleMode("none")}
                className={`group relative overflow-hidden md:min-h-[144px] w-full rounded-xl px-3 py-2 md:p-5 text-left bg-white dark:bg-white/5 border border-white/20 transition-all duration-200 ease-in-out ${shuffleMode === "none"
                  ? "ring-2 ring-gray-300 dark:ring-white/30 shadow-xl shadow-gray-400/30 dark:shadow-lg dark:shadow-white/10"
                  : "hover:border-white/30 dark:hover:border-white/30"
                  }`}
              >
                {/* Background overlay khi được chọn - Dark mode */}
                <div className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 ${shuffleMode === "none" ? "opacity-100" : "opacity-0"
                  } hidden dark:block bg-gradient-to-br from-slate-700 to-gray-800`}></div>
                {/* Pattern overlay khi được chọn */}
                {shuffleMode === "none" && (
                  <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none"></div>
                )}
                {/* Selected indicator */}
                {shuffleMode === "none" && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-600 dark:bg-green-500 flex items-center justify-center shadow-md">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="relative flex flex-col justify-start md:h-full md:justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40">
                      <svg
                        className="w-5 h-5 md:w-6 md:h-6 text-green-600 dark:text-green-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm md:text-base mb-0 md:mb-1 text-gray-900 dark:text-gray-50">
                        Không trộn
                      </div>
                    </div>
                  </div>
                  <p className="hidden md:block text-xs md:text-sm leading-relaxed text-gray-600 dark:text-gray-200">
                    Giữ nguyên thứ tự câu hỏi hiển thị trên web
                  </p>
                </div>
              </button>

              <button
                onClick={() => setShuffleMode("random")}
                className={`group relative overflow-hidden md:min-h-[144px] w-full rounded-xl px-3 py-2 md:p-5 text-left bg-white dark:bg-white/5 border border-white/20 transition-all duration-200 ease-in-out ${shuffleMode === "random"
                  ? "ring-2 ring-gray-300 dark:ring-white/30 shadow-xl shadow-gray-400/30 dark:shadow-lg dark:shadow-white/10"
                  : "hover:border-white/30 dark:hover:border-white/30"
                  }`}
              >
                {/* Background overlay khi được chọn - Dark mode */}
                <div className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-200 ${shuffleMode === "random" ? "opacity-100" : "opacity-0"
                  } hidden dark:block bg-gradient-to-br from-slate-700 to-gray-800`}></div>
                {/* Pattern overlay khi được chọn */}
                {shuffleMode === "random" && (
                  <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none"></div>
                )}
                {/* Selected indicator */}
                {shuffleMode === "random" && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-orange-600 dark:bg-orange-500 flex items-center justify-center shadow-md">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div className="relative flex flex-col justify-start md:h-full md:justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/40">
                      <svg
                        className="w-5 h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm md:text-base mb-0 md:mb-1 text-gray-900 dark:text-gray-50">
                        Trộn ngẫu nhiên
                      </div>
                    </div>
                  </div>
                  <p className="hidden md:block text-xs md:text-sm leading-relaxed text-gray-600 dark:text-gray-200">
                    Trộn thứ tự câu hỏi và đáp án trong từng câu
                  </p>
                </div>
              </button>
            </div>

            {/* Separator */}
            <div className="relative py-4 px-4 md:py-6 md:px-6">
              <div className="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            </div>

            {/* Button bắt đầu */}
            <div className="relative px-4 pb-4 md:px-6 md:pb-6">
              <button
                onClick={() => {
                  if (selectedUiMode !== null && shuffleMode !== null) {
                    setUiMode(selectedUiMode);
                    // Áp dụng shuffle nếu người dùng chọn "Trộn ngẫu nhiên"
                    if (shuffleMode === "random") {
                      setQuestions(shuffleQuestions(originalQuestions));
                    } else {
                      // Giữ nguyên thứ tự gốc
                      setQuestions(originalQuestions);
                    }
                    setShowModeChooser(false);
                  }
                }}
                disabled={selectedUiMode === null || shuffleMode === null}
                className={`w-full py-3 px-4 md:py-4 md:px-6 rounded-xl font-semibold text-base transition-all duration-300 ${selectedUiMode !== null && shuffleMode !== null
                  ? "bg-white text-blue-700 hover:bg-blue-50 shadow-lg hover:shadow-xl dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-700 dark:text-white dark:hover:from-blue-700 dark:hover:to-blue-800"
                  : "bg-white/20 text-white/40 cursor-not-allowed dark:bg-white/10"
                  }`}
              >
                {selectedUiMode === null || shuffleMode === null ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Vui lòng chọn cả 2 tùy chọn
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Bắt đầu làm bài
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TextRevealPanel: React.FC<{ question: Question; userValue: string }> = ({
  question,
  userValue,
}) => {
  const ca = Array.isArray(question.correctAnswers)
    ? (question.correctAnswers as string[])
    : [];
  const norm = (s: string) => (s || "").trim();
  const isOk = ca.some(
    (ans) => norm(ans).toLowerCase() === norm(userValue).toLowerCase()
  );
  return (
    <div
      className={`mt-2 rounded-lg border p-3 text-sm transition-colors ${isOk
        ? "border-green-500 bg-green-50/60 text-green-800 dark:border-green-400 dark:bg-green-900/20 dark:text-green-200"
        : "border-red-500 bg-red-50/60 text-red-800 dark:border-red-400 dark:bg-red-900/20 dark:text-red-200"
        }`}
    >
      {isOk ? "Chính xác!" : "Chưa chính xác."}
      <div className="mt-1">
        <span className="opacity-80">Đáp án của bạn:</span>{" "}
        <span className="font-medium">{userValue || "(Trống)"}</span>
      </div>
      <div className="mt-1">
        <span className="opacity-80">Đáp án đúng:</span>{" "}
        <span className="font-medium">
          {ca.join(" | ") || "(Không thuộc nhóm nào)"}
        </span>
      </div>
    </div>
  );
};

// Drag & Drop component for 'drag' question type
const DragDropQuestion: React.FC<{
  question: Question;
  value: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  reveal?: boolean;
  correctMapping?: Record<string, string>;
}> = ({ question, value, onChange, reveal = false, correctMapping = {} }) => {
  const targets =
    ((question.options && (question.options as any).targets) as DragTarget[]) ||
    [];
  const items =
    ((question.options && (question.options as any).items) as DragItem[]) || [];

  const [mapping, setMapping] = useState<Record<string, string>>(() => ({
    ...(value || {}),
  }));
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Sync up to parent whenever local mapping changes
  useEffect(() => {
    onChange(mapping);
  }, [mapping]);

  // Reset local mapping when switching to a different question (avoid carrying over state)
  useEffect(() => {
    setMapping({ ...(value || {}) });
  }, [question.id]);

  const poolItems = items.filter((it) => !mapping[it.id]);
  const itemsByTarget: Record<string, DragItem[]> = {};
  for (const t of targets) itemsByTarget[t.id] = [];
  for (const it of items) {
    const tid = mapping[it.id];
    if (tid && itemsByTarget[tid]) itemsByTarget[tid].push(it);
  }

  const assign = (itemId: string, targetId?: string) => {
    if (reveal) return; // khoá sau khi reveal
    setMapping((prev) => {
      const next = { ...prev } as any;
      if (!targetId) delete next[itemId];
      else next[itemId] = targetId;
      return next;
    });
  };

  const isItemCorrect = (it: DragItem) => {
    if (!reveal) return undefined;
    const cur = mapping[it.id];
    const ok =
      correctMapping && correctMapping[it.id] && cur === correctMapping[it.id];
    return ok ? true : cur ? false : undefined;
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    if (reveal) {
      e.preventDefault();
      return;
    }
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", itemId);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId?: string) => {
    e.preventDefault();
    if (reveal) return;
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(targetId || "pool");
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetId?: string) => {
    e.preventDefault();
    if (reveal) return;
    if (draggedItem) {
      assign(draggedItem, targetId);
    }
    setDraggedItem(null);
    setDragOverTarget(null);
  };

  return (
    <div className="drag-question space-y-4">
      {/* Kho đáp án */}
      <div
        className={`border border-gray-400 rounded-lg p-4 bg-gray-200/40 dark:border-gray-600 dark:bg-gray-900/30 transition-all duration-200 ${dragOverTarget === "pool"
          ? "ring-2 ring-yellow-500 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
          : ""
          }`}
        onDragOver={(e) => handleDragOver(e)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e)}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-center">
          Kho đáp án
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {poolItems.map((it) => (
            <button
              key={it.id}
              draggable={!reveal}
              onDragStart={(e) => handleDragStart(e, it.id)}
              onDragEnd={handleDragEnd}
              className={`p-3 rounded-lg font-medium border-2 text-left transition-all duration-200 ${reveal ? "cursor-default" : "cursor-move"
                } ${draggedItem === it.id ? "opacity-50 scale-95" : ""} ${reveal && correctMapping[it.id]
                  ? "bg-red-600 border-transparent text-white dark:bg-red-900/40 dark:text-red-200 dark:border-red-500"
                  : "bg-yellow-500 text-white border-yellow-500 shadow-md shadow-yellow-500/20 hover:bg-yellow-600 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border dark:border-yellow-500 dark:shadow-md dark:shadow-yellow-500/20 dark:hover:bg-yellow-900/30"
                }`}
              onClick={() => assign(it.id, undefined)}
              disabled={reveal}
            >
              <span className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8h16M4 16h16"
                  />
                </svg>
                {it.label}
              </span>
            </button>
          ))}
          {poolItems.length === 0 && (
            <div className="col-span-full text-center py-4 text-sm text-gray-500 dark:text-gray-400">
              Tất cả đáp án đã được phân loại
            </div>
          )}
        </div>
      </div>

      {/* Các nhóm đích */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {targets.map((t) => (
          <div
            key={t.id}
            className={`border border-gray-400 rounded-lg p-4 bg-gray-200/40 dark:border-gray-600 dark:bg-gray-900/30 transition-all duration-200 ${dragOverTarget === t.id
              ? "ring-2 ring-primary-500 border-primary-500 bg-primary-50 dark:bg-primary-900/20"
              : ""
              }`}
            onDragOver={(e) => handleDragOver(e, t.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, t.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {t.label}
              </h3>
              <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full">
                {(itemsByTarget[t.id] || []).length} đáp án
              </span>
            </div>

            {/* Dropdown chọn đáp án */}
            {poolItems.length > 0 && (
              <div className="mb-3">
                <select
                  disabled={reveal}
                  className="w-full p-2.5 border border-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  value=""
                  onChange={(e) => {
                    const itemId = e.target.value;
                    if (itemId) assign(itemId, t.id);
                  }}
                >
                  <option
                    value=""
                    className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    -- Chọn đáp án --
                  </option>
                  {poolItems.map((it) => (
                    <option
                      key={it.id}
                      value={it.id}
                      className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {it.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Đáp án đã chọn */}
            <div className="space-y-2 min-h-[60px]">
              {(itemsByTarget[t.id] || []).map((it) => {
                const state = isItemCorrect(it);
                const base =
                  "w-full p-3 rounded-lg font-medium border-2 text-left transition-all duration-200";
                const normal =
                  "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 hover:bg-primary-600 dark:bg-primary-900/50 dark:text-primary-100 dark:border dark:border-primary-400 dark:shadow-lg dark:shadow-primary-500/25 dark:hover:bg-primary-900/60";
                const ok =
                  "bg-green-500 text-white border-transparent shadow-md shadow-green-500/20 dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
                const bad =
                  "bg-red-600 text-white border-transparent shadow-md shadow-red-600/20 dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
                return (
                  <button
                    key={it.id}
                    draggable={!reveal}
                    onDragStart={(e) => handleDragStart(e, it.id)}
                    onDragEnd={handleDragEnd}
                    className={`${base} ${reveal ? "cursor-default" : "cursor-move"
                      } ${draggedItem === it.id ? "opacity-50 scale-95" : ""} ${state === undefined ? normal : state ? ok : bad
                      }`}
                    onClick={() => assign(it.id, undefined)}
                    disabled={reveal}
                  >
                    <span className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8h16M4 16h16"
                        />
                      </svg>
                      {it.label}
                    </span>
                  </button>
                );
              })}
              {(itemsByTarget[t.id] || []).length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  Chưa có đáp án
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hướng dẫn */}
      <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p>
          <strong>Hướng dẫn:</strong> Kéo thả đáp án từ kho vào nhóm tương ứng,
          hoặc chọn từ dropdown. Nhấn vào đáp án đã chọn để đưa về kho.
        </p>
        {reveal && (
          <div className="mt-2 rounded-lg border p-3 transition-colors text-sm text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600">
            <div className="font-medium mb-1">Đáp án đúng:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {items.map((it) => (
                <li key={it.id}>
                  <span className="opacity-80">{it.label}</span> →{" "}
                  <span className="font-medium">
                    {targets.find(
                      (t) => t.id === (correctMapping as any)[it.id]
                    )?.label || "(Không thuộc nhóm nào)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizPage;
