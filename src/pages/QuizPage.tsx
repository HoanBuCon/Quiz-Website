import {
  FaRegDotCircle,
  FaRegEdit,
  FaRegHandPointer,
  FaSitemap,
  FaRegClock,
  FaList,
  FaLayerGroup,
  FaTh,
} from "react-icons/fa";
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import QuizAnswerOption from "../components/QuizAnswerOption";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import MathText from "../components/MathText";
import { Question, UserAnswer, DragTarget, DragItem } from "../types";
import { buildShortId } from "../utils/share";
import ImageModal from "../components/ImageModal";

// Component trang làm bài trắc nghiệm
const QUIZ_PROGRESS_KEY = "quiz_progress";
const QUIZ_VIEW_MODE_KEY = "quiz_view_mode_pref";

const QuizPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]); // Lưu câu hỏi gốc
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [markedQuestions, setMarkedQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizTitle, setQuizTitle] = useState("");
  const [className, setClassName] = useState("");
  const [startTime, setStartTime] = useState(Date.now()); // Thời gian bắt đầu làm bài
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
  // Display mode: 'single' (từng câu) | 'list' (danh sách)
  const [displayMode, setDisplayMode] = useState<"single" | "list">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(QUIZ_VIEW_MODE_KEY);
      return (saved === "single" || saved === "list") ? saved : "single";
    }
    return "single";
  });
  // Theo dõi xem người dùng đã chọn ui mode chưa
  const [selectedUiMode, setSelectedUiMode] = useState<"default" | "instant" | null>(null);
  // State để chặn auto-save khi đang nộp bài
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Lưu trạng thái đã xác nhận (reveal) cho các câu hỏi cần nút Xác nhận (text/drag)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  // Theo dõi viewport để render floating nút chuyển đổi chỉ khi >= 1024px (lg)
  const [isLarge, setIsLarge] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );
  // State để theo dõi vị trí focus bằng bàn phím
  // focusedOption: index của đáp án đang focus (-1: không focus, >= 0: index đáp án, 9999: nút Xác nhận)
  const [focusedOption, setFocusedOption] = useState<number>(-1);

  // State chiều animation slide (left/right)
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | "none">("none");
  // State đang exit (để render animation out)
  const [isExiting, setIsExiting] = useState(false);

  // State xem ảnh fullscreen
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // State để theo dõi layout của ảnh câu hỏi (portrait hoặc landscape)
  const [questionImageLayout, setQuestionImageLayout] = useState<"portrait" | "landscape">("portrait");

  // Ref cho minimap container để xử lý scroll
  const minimapRef = React.useRef<HTMLDivElement>(null);
  const mainContentRef = React.useRef<HTMLDivElement>(null);
  const navLockRef = React.useRef(false); // Lock synchronous navigation to prevent spamming
  const lastKeyPressRef = React.useRef<number>(0); // Track last keypress timestamp để tránh spam
  const SCROLL_OFFSET = 120; // Khoảng cách bù trừ khi scroll tới câu hỏi
  // Set tracking visible elements for robust scroll sync
  const visibleElemsRef = React.useRef<Set<Element>>(new Set());
  // Track hovered/focused question for List Mode Enter key action
  const hoveredQuestionIdRef = React.useRef<string | null>(null);
  // Minimap bubble (mobile list) state
  const [miniBubbleOpen, setMiniBubbleOpen] = useState(false);
  const [miniBubblePos, setMiniBubblePos] = useState<{ x: number; y: number }>(() => {
    const w = typeof window !== "undefined" ? window.innerWidth : 390;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return { x: Math.max(12, w - 76), y: Math.max(12, h - 140) };
  });

  const getScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
    let cur: HTMLElement | null = el;
    while (cur) {
      const style = window.getComputedStyle(cur);
      const overflowY = style.overflowY;
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        cur.scrollHeight > cur.clientHeight + 4;
      if (canScroll) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  // Tìm câu hỏi (kể cả sub-question) theo id
  const findQuestionById = (qid: string): { question: Question | null; parent?: Question | null } => {
    for (const q of questions) {
      if (q.id === qid) return { question: q, parent: null };
      if (q.type === "composite" && (q as any).subQuestions) {
        for (const sub of (q as any).subQuestions as Question[]) {
          if (sub.id === qid) return { question: sub, parent: q };
        }
      }
    }
    return { question: null, parent: null };
  };

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
      if (q.type === "drag") {
        const opts = q.options as any;
        if (opts && Array.isArray(opts.items) && Array.isArray(opts.targets)) {
          return {
            ...q,
            options: {
              ...opts,
              items: shuffleArray(opts.items as DragItem[]),
              targets: shuffleArray(opts.targets as DragTarget[]),
            },
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
            if (sub.type === "drag") {
              const subOpts = sub.options as any;
              if (subOpts && Array.isArray(subOpts.items) && Array.isArray(subOpts.targets)) {
                return {
                  ...sub,
                  options: {
                    ...subOpts,
                    items: shuffleArray(subOpts.items as DragItem[]),
                    targets: shuffleArray(subOpts.targets as DragTarget[]),
                  },
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
        // console.error("Quiz ID not provided");
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
          // Check for saved progress (priority)
          const savedRaw = localStorage.getItem(QUIZ_PROGRESS_KEY);
          let restored = false;
          // [MODIFIED] If this is a retry attempt (manualResult), do not restore from localStorage
          // because localStorage might contain full-quiz data or previous session data.
          // We want to force a fresh init with filtered questions.
          if (savedRaw && !(location.state as any)?.retryMode) {
            try {
              const saved = JSON.parse(savedRaw);
              if (saved && saved.quizId === quizId) {
                // Restore state
                setQuizTitle(saved.quizTitle || found.title);
                setClassName(saved.className || found.className || (location.state as any)?.className || "");
                setQuestions(saved.questions);
                setOriginalQuestions(found.questions || []); // Keep original for reference
                setEffectiveQuizId(saved.effectiveQuizId || found.id);
                setUserAnswers(saved.userAnswers || []);
                setCurrentQuestionIndex(saved.currentQuestionIndex || 0);
                setAttemptId(saved.attemptId);
                setUiMode(saved.uiMode || "default");
                setShuffleMode(saved.shuffleMode || null);
                // displayMode is now managed globally via QUIZ_VIEW_MODE_KEY
                setSelectedUiMode(saved.selectedUiMode || null);
                if (saved.revealed) {
                  setRevealed(new Set(saved.revealed));
                }

                // Timer restoration
                if (typeof saved.elapsed === 'number') {
                  setElapsed(saved.elapsed);
                  setStartTime(Date.now() - saved.elapsed * 1000);
                }

                restored = true;
                setLoading(false);
                return;
              }
            } catch (e) {
              console.error("Error restoring progress:", e);
            }
          }

          if (!restored) {
            setQuizTitle(found.title);
            setClassName(found.className || (location.state as any)?.className || "");
            const loadedQuestions = found.questions || [];
            setOriginalQuestions(loadedQuestions);

            // [MODIFIED] Handle Retry Mode
            if ((location.state as any)?.retryMode && Array.isArray((location.state as any)?.incorrectOrder)) {
              const incorrectIds = (location.state as any).incorrectOrder as string[];
              // Filter questions
              const filteredQs = loadedQuestions.filter((q: Question) => incorrectIds.includes(q.id));
              // Also sort them to match the incorrectOrder
              const sortedQs = incorrectIds.map(id => filteredQs.find((q: Question) => q.id === id)).filter(Boolean) as Question[];
              setQuestions(sortedQs);
              setOriginalQuestions(sortedQs);
            } else {
              setQuestions(loadedQuestions);
              setOriginalQuestions(loadedQuestions);
            }

            setEffectiveQuizId(found.id);
          }
        } else {
          throw new Error("Quiz không tìm thấy");
        }
      } catch (error: any) {
        // console.error("Error loading quiz:", error);
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
    if (attemptRef.current) return; // Prevent restart if restored

    // [MODIFIED] Skip starting session if Retry Mode
    if ((location.state as any)?.retryMode) return;

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
      // sendEnd(); // [MODIFIED] Removed to allow Resume logic
    };
  }, []);

  // Tự động lưu progress mỗi khi state thay đổi
  useEffect(() => {
    // Chỉ lưu khi đã có dữ liệu cơ bản
    if (loading || !quizId || questions.length === 0) return;

    // Không lưu nếu đang nộp bài
    if (isSubmitting) return;

    // Không lưu nếu ở chế độ default (chưa nộp)
    // if (uiMode === 'default') return; // Thử nghiệm: Vẫn cho lưu ở default để F5 không mất bài

    const stateToSave = {
      quizId,
      quizTitle,
      className,
      questions,
      // originalQuestions, // Không cần lưu double
      effectiveQuizId,
      userAnswers,
      currentQuestionIndex,
      attemptId,
      uiMode,
      shuffleMode,
      displayMode,
      selectedUiMode,
      revealed: Array.from(revealed),
      elapsed,
      timestamp: Date.now(),
    };

    localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(stateToSave));
  }, [
    loading,
    quizId,
    questions,
    originalQuestions,
    effectiveQuizId,
    userAnswers,
    currentQuestionIndex,
    attemptId,
    uiMode,
    shuffleMode,
    displayMode,
    selectedUiMode,
    revealed,
    elapsed, // Đã bao gồm elapsed để lưu thời gian làm bài
    isSubmitting
  ]);

  // Sync scroll position with currentQuestionIndex in List mode
  // Sync scroll position with currentQuestionIndex in List mode
  useEffect(() => {
    if (displayMode !== "list") return;

    // Helper to calculate best candidate
    const determineActiveQuestion = () => {
      const visible = Array.from(visibleElemsRef.current);
      if (visible.length === 0) return;

      const viewportCenter = window.innerHeight / 2;
      let minDistance = Infinity;
      let bestCandidate: Element | null = null;

      for (const el of visible) {
        const rect = el.getBoundingClientRect();
        // Calculate distance from element center to viewport center
        const elementCenter = rect.top + rect.height / 2;
        const dist = Math.abs(elementCenter - viewportCenter);

        // Check if element covers the center line specifically (robust for long content)
        const coversCenter = rect.top <= viewportCenter && rect.bottom >= viewportCenter;

        if (coversCenter) {
          // If covering center, it's the winner immediately (or pick closest center among covering? Usually only 1 covers center unless weird overlap)
          // Actually, if a question is super long, center might be far, but it covers the screen.
          // Priority: specific coverage of center line > distance of centers
          bestCandidate = el;
          break;
        }

        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = el;
        }
      }

      if (bestCandidate) {
        const indexAttr = bestCandidate.getAttribute("data-question-index");
        if (indexAttr !== null) {
          const index = Number(indexAttr);
          if (!isNaN(index)) {
            setCurrentQuestionIndex((curr) => (curr !== index ? index : curr));
          }
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleElemsRef.current.add(entry.target);
          } else {
            visibleElemsRef.current.delete(entry.target);
          }
        });

        determineActiveQuestion();
      },
      {
        root: null,
        // Trigger as soon as a bit is visible, but we rely on bounding box math for decision
        threshold: 0,
        rootMargin: "0px 0px 0px 0px",
      }
    );

    const questionCards = document.querySelectorAll("[data-question-index]");
    questionCards.forEach((card) => observer.observe(card));

    // Also listen to scroll/resize to update "closest to center" dynamically while scrolling
    // IntersectionObserver only fires on cross threshold. We want continous update if possible?
    // Actually, IntersectionObserver with multiple thresholds is okay, but explicit scroll listener is smoother for "center" logic
    // but expensive.
    // Let's stick to IntersectionObserver updates first. To make it smooth for long questions, 
    // simply processing on intersection change might NOT be enough if the large question stays 
    // intersecting while we scroll past its center.
    // HYBRID: Use IO to maintain "Candidate Set", use Scroll Listener (throttled) to pick winner.

    const handleScroll = () => {
      if (visibleElemsRef.current.size > 0) determineActiveQuestion();
    };

    // Throttled scroll listener
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      visibleElemsRef.current.clear();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [displayMode, questions]); // Re-run when switching modes or questions change

  // Hỏi người dùng chọn định dạng khi vào trang
  useEffect(() => {
    // Chỉ hiển thị sau khi loading xong và có câu hỏi hợp lệ
    if (!loading && questions.length > 0 && shuffleMode === null && selectedUiMode === null) {
      setShowModeChooser(true);
    }
  }, [loading, questions.length]);

  // Persist displayMode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(QUIZ_VIEW_MODE_KEY, displayMode);
  }, [displayMode]);

  // Lắng nghe thay đổi kích thước màn hình để quyết định có render floating toggle hay không
  useEffect(() => {
    const onResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Clamp minimap bubble khi thay đổi kích thước
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMiniBubblePos((p) => ({
        x: clamp(p.x, 8, w - 64),
        y: clamp(p.y, 8, h - 64),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Save progress effect
  // Save progress effect (Debounced)
  useEffect(() => {
    if (isSubmitting) return; // Block saving if submitting
    if (!loading && questions.length > 0 && quizId) {
      const timer = setTimeout(() => {
        const dataToSave = {
          quizId,
          quizTitle,
          className,
          questions,
          userAnswers,
          currentQuestionIndex,
          attemptId,
          uiMode,
          shuffleMode,
          displayMode,
          selectedUiMode,
          revealed: Array.from(revealed),
          elapsed, // Save current elapsed
          effectiveQuizId,
          timestamp: Date.now()
        };
        localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(dataToSave));
      }, 500); // Debounce 500ms
      return () => clearTimeout(timer);
    }
  }, [quizId, quizTitle, className, questions, userAnswers, currentQuestionIndex, attemptId, uiMode, shuffleMode, displayMode, selectedUiMode, revealed, elapsed, effectiveQuizId, loading, isSubmitting]);

  // Reset focus khi chuyển câu hỏi & Auto scroll minimap
  useEffect(() => {
    setFocusedOption(-1);

    // Auto scroll minimap to center current question
    if (minimapRef.current) {
      const activeBtn = minimapRef.current.children[currentQuestionIndex] as HTMLElement;
      if (activeBtn) {
        const container = minimapRef.current;
        const scrollLeft =
          activeBtn.offsetLeft -
          container.offsetWidth / 2 +
          activeBtn.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [currentQuestionIndex]);

  // ======================
  // List Mode Specific Shortcuts
  // ======================
  useEffect(() => {
    if (displayMode !== "list" || uiMode !== "instant") return;

    const handleListModeKeyDown = (e: KeyboardEvent) => {
      // Only handle Enter
      if (e.key === "Enter" && hoveredQuestionIdRef.current) {
        const qId = hoveredQuestionIdRef.current;
        const q = questions.find((item) => item.id === qId);

        if (
          q &&
          ["multiple", "text", "drag", "composite"].includes(q.type)
        ) {
          // Use capture phase to prevent button activation
          e.stopPropagation();
          e.preventDefault();
          markRevealed(qId);
        }
      }
    };

    // Use capture: true to intercept before React/Button handlers
    window.addEventListener("keydown", handleListModeKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleListModeKeyDown, { capture: true });
  }, [displayMode, uiMode, questions]);

  // ======================
  // Keyboard Navigation (arrow keys + Enter)
  // ======================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nếu đang hiển thị mode chooser thì bỏ qua
      if (showModeChooser) return;
      if (displayMode === "list") return; // Disable keys in list mode

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
          // Throttle: chỉ xử lý nếu đã qua ít nhất 300ms từ lần bấm cuối
          const nowLeft = Date.now();
          if (!isExiting && nowLeft - lastKeyPressRef.current >= 300) {
            lastKeyPressRef.current = nowLeft;
            handlePrevQuestion();
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          // Throttle: chỉ xử lý nếu đã qua ít nhất 300ms từ lần bấm cuối
          const nowRight = Date.now();
          if (!isExiting && nowRight - lastKeyPressRef.current >= 300) {
            lastKeyPressRef.current = nowRight;
            handleNextQuestion();
          }
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
          e.preventDefault();
          if (hasConfirmButton && !isLocked) {
            markRevealed(currentQuestion.id);
          } else if (focusedOption >= 0 && focusedOption < totalOptions && !isLocked) {
            // Nếu không có nút confirm (ví dụ single choice), Enter vẫn chọn đáp án
            // Hoặc fallback logic cũ
            if (currentQuestion.type === "composite") {
              // Logic cũ cho composite (nhưng composite có nút confirm, nên sẽ vào nhánh if trên)
              // Tuy nhiên, nếu user muốn Enter chọn đáp án trong SINGLE choice sub-question của composite?
              // User yêu cầu: "Câu hỏi mẹ chứa nhiều câu hỏi con... Nút Enter... kích hoạt nút Xác nhận".
              // Vậy nên logic composite sẽ vào nhánh if trên.
            }
            else if (currentQuestion.type === "text") {
              // Text có nút confirm -> vào nhánh if trên.
            }
            else {
              // Single / Multiple (nếu multiple không có nút confirm - mode default)
              // Nhưng logic hasConfirmButton = uiMode === 'instant' && ...
              // Nếu uiMode === 'default', hasConfirmButton = false.
              // Khi đó Enter GIỮ NGUYÊN behavior chọn đáp án (select).

              // Logic cũ handleAnswerSelect:
              const opts = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];
              const option = opts[focusedOption] as string | undefined;
              if (option) handleAnswerSelect(currentQuestion.id, option);
            }
          } else if (focusedOption === -1 && totalOptions > 0) {
            setFocusedOption(0);
          }
          break;

        case " ":
        case "Spacebar":
          e.preventDefault();

          if (focusedOption === 9999 && hasConfirmButton && !isLocked) {
            // Space trên nút Xác nhận -> Click
            markRevealed(currentQuestion.id);
          } else if (focusedOption >= 0 && focusedOption < totalOptions && !isLocked) {
            // Space để chọn đáp án (Check checkboxes etc)
            if (currentQuestion.type === "composite") {
              const subs = (currentQuestion as any).subQuestions || [];
              let cumulativeIndex = 0;

              for (const sub of subs) {
                const subOptionsCount = sub.type === "text" ? 1 : (Array.isArray(sub.options) ? sub.options.length : 0);

                if (focusedOption < cumulativeIndex + subOptionsCount) {
                  const localIndex = focusedOption - cumulativeIndex;

                  if (sub.type === "text") {
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
    const resolved = findQuestionById(questionId);
    const targetQuestion = resolved.question || questions[currentQuestionIndex];
    const parentQuestion = resolved.parent || null;
    if (!targetQuestion) return;

    // Xác định type: ưu tiên questionType được truyền vào (cho sub-question), fallback về targetQuestion.type
    const typeToCheck = questionType || targetQuestion.type;

    // Nếu đang ở chế độ instant và câu hỏi đã reveal (khoá), không cho chọn lại
    if (uiMode === "instant") {
      // Khoá top-level khi đã reveal
      if (revealed.has(questionId)) return;
      // Trong composite: nếu đang chọn câu con và parent đã reveal thì không cho chọn
      if (parentQuestion && revealed.has(parentQuestion.id)) return;
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
      const isTopLevel = !parentQuestion;
      if (
        isTopLevel &&
        typeToCheck === "single" &&
        targetQuestion.type === "single"
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
  // Navigate to next/previous question
  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0 && !isExiting) {
      navLockRef.current = true;
      setSlideDirection("left"); // Hướng đi về (Prev) -> Slide In Left (sau đó). Out sẽ là Right.
      // Logic:
      // Prev: Old slides out to Right -> New slides in from Left

      setIsExiting(true);
      setTimeout(() => {
        setCurrentQuestionIndex((prev) => prev - 1);
        setIsExiting(false);
        // Unlock ngay sau khi đổi index (cho phép bấm tiếp)
        setTimeout(() => {
          navLockRef.current = false;
        }, 150); // 150ms - cân bằng giữa tốc độ và độ mượt
        // Reset slideDirection sau khi slideIn hoàn thành
        setTimeout(() => {
          setSlideDirection("none");
        }, 400); // 400ms khớp với slideIn animation duration
      }, 300); // 300ms khớp với slideOut animation duration
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1 && !isExiting) {
      navLockRef.current = true;
      setSlideDirection("right"); // Hướng đi tới (Next) -> Slide In Right. Out sẽ là Left.
      // Logic:
      // Next: Old slides out to Left -> New slides in from Right

      setIsExiting(true);
      setTimeout(() => {
        setCurrentQuestionIndex((prev) => prev + 1);
        setIsExiting(false);
        // Unlock ngay sau khi đổi index (cho phép bấm tiếp)
        setTimeout(() => {
          navLockRef.current = false;
        }, 150); // 150ms - cân bằng giữa tốc độ và độ mượt
        // Reset slideDirection sau khi slideIn hoàn thành
        setTimeout(() => {
          setSlideDirection("none");
        }, 400); // 400ms khớp với slideIn animation duration
      }, 300); // 300ms khớp với slideOut animation duration
    }
  };

  // Scroll tới câu hỏi trong chế độ danh sách
  const scrollToQuestion = (qid: string) => {
    const container = mainContentRef.current;
    const target =
      (container?.querySelector?.(`#q-${qid}`) as HTMLElement | null) ||
      document.getElementById(`q-${qid}`);
    if (!target) return;

    const scrollFn = () => {
      const isDesktop =
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1280px)").matches;

      const scrollableParent = getScrollableParent(container || target.parentElement);
      if (isDesktop && scrollableParent) {
        const containerRect = scrollableParent.getBoundingClientRect();
        const elementRect = target.getBoundingClientRect();
        const currentScroll = scrollableParent.scrollTop;
        const offset = 16; // chừa khoảng trống nhỏ trong container
        const top =
          currentScroll +
          (elementRect.top - containerRect.top) -
          offset;
        scrollableParent.scrollTo({ top, behavior: "smooth" });
        return;
      }

      // Fallback: cuộn theo window
      const rect = target.getBoundingClientRect();
      const top = (window.pageYOffset || window.scrollY || 0) + rect.top - SCROLL_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    };

    // Thực thi ngay và fallback frame kế tiếp để đảm bảo layout ổn định
    scrollFn();
    requestAnimationFrame(scrollFn);
  };

  // Submit answers
  const handleSubmit = async () => {
    if (window.confirm("Bạn có chắc chắn muốn nộp bài?")) {
      setIsSubmitting(true); // Stop auto-save
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

        // Clear saved progress before submitting
        localStorage.removeItem(QUIZ_PROGRESS_KEY);

        // [MODIFIED] Handle Retry Mode Submission (Local only)
        if ((location.state as any)?.retryMode) {
          const qid = effectiveQuizId || quizId!;

          // Calculate score locally
          let localScore = 0;
          questions.forEach(q => {
            // Reuse logic from ResultsPage (duplicated essentially, but needed for local calc)
            // Simplification: We assume ResultsPage will re-calculate score if we pass answers
            // BUT ResultsPage expects 'score' in result object.
            // Let's implement basic scoring here or just pass needed data.
            // Actually ResultsPage expects 'score' and 'totalQuestions' in result object.

            // Reuse helper isAnswerIncorrect from this component?
            // Note: isAnswerIncorrect uses getCurrentAnswer -> userAnswers state

            // Important: isAnswerIncorrect doesn't check composite sub-questions deeply for score, 
            // it's for UI highlighting.
            // Let's do a robust check similar to ResultsPage

            const getStatus = (question: Question) => {
              const ua = answersMap[question.id];
              // Basic check
              if (!ua) return false;

              if (question.type === 'text') {
                const val = typeof ua === 'object' ? ua[0] : ua;
                const userText = String(val || '').trim().toLowerCase();
                const ca = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
                return ca.some((a: string) => a.trim().toLowerCase() === userText);
              } else if (question.type === 'drag') {
                // Drag check
                const correctMap = question.correctAnswers as Record<string, string>;
                const userMap = ua as Record<string, string>;
                const items = ((question.options as any)?.items || []) as DragItem[];
                return items.every(item => {
                  const u = userMap[item.id] || undefined;
                  const c = correctMap[item.id] || undefined;
                  return u === c;
                });
              } else {
                // Single/Multiple
                const uaArr = Array.isArray(ua) ? ua : [ua];
                const caArr = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
                return uaArr.length === caArr.length && uaArr.every((a: string) => caArr.includes(a));
              }
            };

            if (q.type === 'composite') {
              const subs = (q as any).subQuestions || [];
              const allSubsCorrect = subs.every((sub: any) => getStatus(sub));
              if (allSubsCorrect) localScore++;
            } else {
              if (getStatus(q)) localScore++;
            }
          });

          const manualResult = {
            quizId: qid,
            quizTitle: `${quizTitle} (Làm lại câu sai)`,
            userAnswers: answersMap,
            score: localScore,
            totalQuestions: questions.length,
            timeSpent,
            completedAt: new Date(),
            quizSnapshot: {
              quizTitle: `${quizTitle} (Làm lại câu sai)`,
              questions: questions
            }
          };

          navigate(`/results/${qid}`, {
            state: {
              manualResult,
              isRetryResult: true
            }
          });
          return;
        }

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
        // console.error("Submit failed:", e);
        alert("Có lỗi xảy ra khi nộp bài.");
        setIsSubmitting(false); // Re-enable if error
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
    const Spinner = require("../components/SpinnerLoading").default;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ transform: 'scale(0.435)' }}>
          <Spinner />
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Guard clause: Check if currentQuestion exists
  if (questions.length === 0 || (!currentQuestion && displayMode !== 'list')) {
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
  // Render question card helper
  const renderQuestionCard = (q: Question, idx: number, isList: boolean) => {
    // Only apply animations in single mode
    const animClass = !isList && isExiting
      ? slideDirection === "right"
        ? "animate-slideOutLeft"
        : slideDirection === "left"
          ? "animate-slideOutRight"
          : ""
      : !isList && slideDirection === "right"
        ? "animate-slideInRight"
        : !isList && slideDirection === "left"
          ? "animate-slideInLeft"
          : "";

    // Check if confirm is needed
    const showConfirm = uiMode === "instant" &&
      (q.type === "multiple" ||
        q.type === "text" ||
        q.type === "drag" ||
        q.type === "composite");

    return (
      <div
        key={isList ? q.id : idx}
        id={`q-${q.id}`}
        data-question-index={idx}
        className={`allow-selection group card p-4 sm:p-6 hover:shadow-2xl transition-all duration-300 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-blue-500 dark:hover:border-l-blue-500 ${animClass} outline-none`}
        tabIndex={isList ? 0 : -1}
        onMouseEnter={() => (hoveredQuestionIdRef.current = q.id)}
        onMouseLeave={() => {
          if (hoveredQuestionIdRef.current === q.id) {
            hoveredQuestionIdRef.current = null;
          }
        }}
        onFocus={() => (hoveredQuestionIdRef.current = q.id)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget) && hoveredQuestionIdRef.current === q.id) {
            hoveredQuestionIdRef.current = null;
          }
        }}
      >
        {/* Question number */}
        <div className="flex flex-row justify-between items-start mb-4 gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Câu {idx + 1}/{questions.length}
            </span>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {q.type === "single"
                ? "Chọn một đáp án"
                : q.type === "multiple"
                  ? "Chọn nhiều đáp án"
                  : q.type === "drag"
                    ? "Kéo thả đáp án vào nhóm tương ứng"
                    : q.type === "composite"
                      ? "Câu hỏi gồm nhiều câu hỏi con"
                      : "Điền đáp án"}
            </span>
          </div>
          <button
            onClick={() => {
              setMarkedQuestions((prev) =>
                prev.includes(q.id)
                  ? prev.filter((id) => id !== q.id)
                  : [...prev, q.id]
              );
            }}
            className={`prevent-selection text-[11px] md:text-sm px-2 md:px-3 py-1 rounded-full leading-tight transition-colors w-auto md:w-fit max-w-[120px] md:max-w-none overflow-hidden text-ellipsis whitespace-nowrap min-h-[1.75rem] max-h-[1.75rem] md:min-h-[2rem] md:max-h-[2rem] flex items-center shrink-0 ${markedQuestions.includes(q.id)
              ? "bg-yellow-500 text-white hover:bg-yellow-600"
              : "bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
          >
            {markedQuestions.includes(q.id)
              ? "Đã đánh dấu"
              : "Xem lại câu này"}
          </button>
        </div>

        {/* Question text */}
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 sm:mb-6 whitespace-pre-wrap break-words">
          <MathText text={q.question} />
        </h2>
        {/* Question image nếu có */}
        {
          q.questionImage && (
            <div className="mb-4 sm:mb-6">
              <img
                src={q.questionImage}
                alt="Question"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const { naturalWidth, naturalHeight } = img;
                  const ratio = naturalWidth / naturalHeight;

                  // If ratio > 4/3, it's a wide landscape image
                  if (ratio > 4 / 3) {
                    setQuestionImageLayout("landscape");
                  } else {
                    setQuestionImageLayout("portrait");
                  }
                }}
                className={`w-auto h-auto max-w-full max-h-[400px] ${questionImageLayout === "landscape" ? "min-h-[100px]" : ""} rounded-lg shadow border border-gray-200 dark:border-gray-600 object-contain cursor-zoom-in mx-auto`}
                onClick={() => setViewingImage(q.questionImage!)}
              />
            </div>
          )
        }

        {/* Divider */}
        <div className="w-full flex items-center my-4 sm:my-6">
          <div className="flex-1 border-t border-gray-400 dark:border-gray-600"></div>
          <span className="px-3 flex items-center justify-center">
            {q.type === "single" ||
              q.type === "multiple" ? (
              <FaRegDotCircle className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            ) : q.type === "text" ? (
              <FaRegEdit className="w-5 h-5 text-green-500 dark:text-green-400" />
            ) : q.type === "drag" ? (
              <FaRegHandPointer className="w-5 h-5 text-purple-500 dark:text-purple-400" />
            ) : q.type === "composite" ? (
              <FaSitemap className="w-5 h-5 text-orange-500 dark:text-orange-400" />
            ) : (
              <FaRegEdit className="w-5 h-5 text-green-500 dark:text-green-400" />
            )}
          </span>
          <div className="flex-1 border-t border-gray-400 dark:border-gray-600"></div>
        </div>

        {/* Answer options */}
        <div className="space-y-2 sm:space-y-3">
          {q.type === "text" && (
            <div className="space-y-2">
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
                const revealed = isRevealed(q.id);
                const isCorrect = isTextAnswerCorrect(q, (getCurrentAnswer(q.id)[0] as string) || "");

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
                    data-question-id={q.id}
                    disabled={revealed}
                    className={`w-full p-3 rounded-lg text-sm sm:text-base transition-colors duration-200 dark:bg-gray-700 dark:text-gray-100 border ${computedClassName}`}
                    placeholder="Nhập câu trả lời của bạn"
                    value={
                      (getCurrentAnswer(q.id)[0] || "") as string
                    }
                    onChange={(e) =>
                      handleAnswerSelect(q.id, e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (uiMode === 'instant' && !revealed) {
                          markRevealed(q.id);
                        }
                      }
                    }}
                  />
                );
              })()}
              {uiMode === "instant" && isRevealed(q.id) && (
                <TextRevealPanel
                  question={q}
                  userValue={
                    (getCurrentAnswer(q.id)[0] as string) ||
                    ""
                  }
                />
              )}
            </div>
          )}
          {q.type !== "text" &&
            q.type !== "drag" &&
            q.type !== "composite" &&
            Array.isArray(q.options) && (
              <div className="space-y-2 sm:space-y-3">
                {q.options.map((option, index) => {
                  const optionImage =
                    q.optionImages &&
                    q.optionImages[option];
                  const selected = getCurrentAnswer(q.id);
                  const shouldReveal = isChoiceReveal(
                    q,
                    selected
                  );
                  const isCorrect =
                    getCorrectAnswers(q).includes(option);
                  const isChosen = selected.includes(option);
                  const locked =
                    uiMode === "instant" &&
                    revealed.has(q.id);
                  const isFocused = focusedOption === index;

                  return (
                    <QuizAnswerOption
                      key={index}
                      option={option}
                      index={index}
                      optionImage={optionImage}
                      selected={isChosen}
                      correct={isCorrect}
                      shouldReveal={shouldReveal}
                      focused={isFocused}
                      disabled={locked}
                      onSelect={() =>
                        handleAnswerSelect(q.id, option)
                      }
                      onViewImage={(src: string) => setViewingImage(src)}
                    />
                  );
                })}
              </div>
            )}
          {q.type === "drag" && (
            <DragDropQuestion
              key={q.id}
              question={q}
              value={
                (userAnswers.find(
                  (a) => a.questionId === q.id
                )?.answers?.[0] as any) || {}
              }
              onChange={(mapping) => {
                setUserAnswers((prev) => {
                  const existing = prev.find(
                    (a) => a.questionId === q.id
                  );
                  if (!existing)
                    return [
                      ...prev,
                      {
                        questionId: q.id,
                        answers: [mapping as any],
                      },
                    ];
                  return prev.map((a) =>
                    a.questionId === q.id
                      ? { ...a, answers: [mapping as any] }
                      : a
                  );
                });
              }}
              reveal={isRevealed(q.id)}
              correctMapping={(q.correctAnswers as any) || {}}
            />
          )}
          {q.type === "composite" &&
            Array.isArray((q as any).subQuestions) && (
              <div className="space-y-4">
                {(q as any).subQuestions.map(
                  (sub: Question, idx: number) => {
                    const parentRevealed = isRevealed(q.id);
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
                              ? "Điền đáp án"
                              : sub.type === "single"
                                ? "Chọn một đáp án"
                                : "Chọn nhiều đáp án"}
                          </span>
                        </div>
                        <div className="font-medium mb-3 text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                          <MathText text={sub.question} />
                        </div>
                        {sub.type === "text" && (
                          <div className="space-y-2">
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
                                const subs = (q as any).subQuestions || [];
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
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (uiMode === 'instant' && !parentRevealed) {
                                        markRevealed(q.id);
                                      }
                                    }
                                  }}
                                />
                              );
                            })()}
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
                                  const subs =
                                    (q as any).subQuestions ||
                                    [];
                                  let cumulative = 0;
                                  // Cộng dồn số options của các sub-question trước đó
                                  for (let i = 0; i < idx; i++) {
                                    const prevSub = subs[i];
                                    cumulative +=
                                      prevSub.type === "text"
                                        ? 1
                                        : Array.isArray(prevSub.options)
                                          ? prevSub.options.length
                                          : 0;
                                  }
                                  // Cộng thêm index của option hiện tại trong sub-question này
                                  return cumulative + oidx;
                                })();

                                // THÊM: Kiểm tra xem option này có đang được focus không
                                const isFocused =
                                  focusedOption === globalIndex;

                                return (
                                  <QuizAnswerOption
                                    key={oidx}
                                    option={opt}
                                    index={oidx}
                                    optionImage={(sub.optionImages || {})[opt]}
                                    selected={isChosen}
                                    correct={isCorrect}
                                    shouldReveal={shouldReveal}
                                    focused={isFocused}
                                    disabled={parentRevealed}
                                    onSelect={() =>
                                      handleAnswerSelect(
                                        sub.id,
                                        opt,
                                        sub.type as "single" | "multiple"
                                      )
                                    }
                                    onViewImage={(src: string) =>
                                      setViewingImage(src)
                                    }
                                  />
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

        {/* Inline Confirm Button for List Mode/Instant */}
        {isList && showConfirm && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => markRevealed(q.id)}
              disabled={isRevealed(q.id)}
              className={`
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
                  `}
            >
              Xác nhận
            </button>
          </div>
        )}
      </div>
    );
  };

  // Left Section - Main Content
  const renderMainContent = () => (
    <div
      className="flex-1 min-w-0 order-2 lg:order-1 space-y-8"
      ref={mainContentRef}
    >
      {displayMode === "list" ? (
        questions.map((q, i) => renderQuestionCard(q, i, true))
      ) : (
        <>
          {renderQuestionCard(currentQuestion, currentQuestionIndex, false)}
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
        </>
      )}
    </div>
  );


  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Top headers row: ẩn ở chế độ danh sách vì đã gom xuống minimap */}
      {displayMode !== "list" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,20rem] gap-4 lg:gap-8 mb-4 sm:mb-6 items-stretch">
          {/* Left header: Title + Timer */}
          <div className="flex h-full flex-row items-center justify-between gap-2 min-w-0">
            <h1 className="flex-1 min-w-0 truncate text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {quizTitle}
            </h1>
            <div className="flex items-center gap-2 px-3 rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 w-fit h-full self-stretch shrink-0 whitespace-nowrap">
              <FaRegClock className="w-4 h-4 shrink-0" />
              <span className="text-sm font-share-tech-mono tabular-nums tracking-[0.15em]">
                {formatElapsed(elapsed)}
              </span>
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
      )}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {renderMainContent()}
        {/* Right Section - Sidebar */}
        <div className={`w-full lg:w-80 lg:flex-shrink-0 order-1 lg:order-2 ${displayMode === "list" ? "lg:sticky lg:top-4 self-start" : ""}`}>
          <div className={`card p-4 sm:p-6 ${displayMode === "list" ? "lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto" : ""}`}>
            {displayMode === "list" && (
              <>
                {/* Mobile View (Preserved) */}
                <div className="lg:hidden mb-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {quizTitle}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mt-1">
                        <FaRegClock className="w-4 h-4" />
                        <span className="font-share-tech-mono tabular-nums tracking-[0.15em]">
                          {formatElapsed(elapsed)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleSubmit}
                      className="btn-primary h-10 px-4 text-sm inline-flex items-center gap-2 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Nộp bài</span>
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      <span>
                        Tiến độ: {questions.filter((q) => isQuestionAnswered(q)).length}/{questions.length} câu
                      </span>
                      <span>
                        {Math.round(
                          (questions.filter((q) => isQuestionAnswered(q)).length / questions.length) * 100
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${(questions.filter((q) => isQuestionAnswered(q)).length / questions.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Desktop View (Optimized Layout - Structure Only) */}
                <div className="hidden lg:flex mb-6 flex-col gap-4">
                  {/* Title Row */}
                  <div className="w-full">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug">
                      {quizTitle}
                    </h3>
                  </div>

                  {/* Stats Row */}
                  {/* Stats Row */}
                  {/* Stats Row */}
                  {/* Stats Row */}
                  <div className="flex items-center gap-3">
                    {/* Timer - Original Style */}
                    <div className="flex items-center gap-2 px-3 h-10 rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 w-fit shrink-0 whitespace-nowrap">
                      <FaRegClock className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-share-tech-mono tabular-nums tracking-[0.15em]">
                        {formatElapsed(elapsed)}
                      </span>
                    </div>

                    {/* Submit Button (Moved here) */}
                    <button
                      onClick={handleSubmit}
                      className="flex-1 btn-primary h-10 text-sm inline-flex items-center justify-center gap-2 font-semibold"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Nộp bài</span>
                    </button>
                  </div>

                  {/* Progress Bar Row */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-gray-500 dark:text-gray-400">
                      <span className="tracking-wider">
                        Tiến độ: {questions.filter((q) => isQuestionAnswered(q)).length}/{questions.length}
                      </span>
                      <span className="font-share-tech-mono">
                        {Math.round(
                          (questions.filter((q) => isQuestionAnswered(q)).length / questions.length) * 100
                        )}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${(questions.filter((q) => isQuestionAnswered(q)).length / questions.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>


                </div>
              </>
            )}
            <div className="flex items-center justify-between mb-3 sm:mb-4 lg:hidden">
              <div className="flex items-center gap-2 ml-auto w-full justify-between lg:hidden h-auto">
                <div className="minimap-toggle-wrap block lg:hidden ml-0 self-stretch h-auto md:h-auto">
                  <button
                    onClick={() =>
                      setUiMode((prev) =>
                        prev === "default" ? "instant" : "default"
                      )
                    }
                    className="inline-flex items-center justify-center gap-1 h-full min-h-full py-1 leading-none px-2 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600 whitespace-nowrap box-border"
                    title="Chuyển đổi chế độ"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 block leading-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}> <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" /> <polyline points="1 20 1 14 7 14" strokeLinecap="round" strokeLinejoin="round" /> <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" /> </svg>
                    <span className="font-medium text-[11px] h-[14px] leading-[14px] flex items-center">
                      {uiMode === "instant" ? "Chế độ: Xem ngay" : "Chế độ: Mặc định"}
                    </span>
                  </button>
                </div>
                <button
                  onClick={() =>
                    setDisplayMode((prev) => (prev === "single" ? "list" : "single"))
                  }
                  className="inline-flex items-center justify-center gap-1 h-full min-h-full py-1 leading-none px-2 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600 whitespace-nowrap box-border"
                  title="Chuyển đổi hiển thị"
                >
                  {displayMode === "single" ? (
                    <FaList className="w-3.5 h-3.5" />
                  ) : (
                    <FaLayerGroup className="w-3.5 h-3.5" />
                  )}
                  <span className="font-medium text-[11px] h-[14px] leading-[14px] flex items-center">
                    {displayMode === "single" ? "Định dạng: Từng câu" : "Định dạng: Danh sách"}
                  </span>
                </button>
              </div>
            </div>
            {displayMode === "list" && !isLarge ? (
              <MemoizedMobileMinimapBubble
                key="mobile-minimap-bubble"
                questions={questions}
                currentQuestionIndex={currentQuestionIndex}
                onSelect={(idx: number, id: string) => {
                  if (displayMode === "list") {
                    setCurrentQuestionIndex(idx);
                    scrollToQuestion(id);
                    setMiniBubbleOpen(false);
                    return;
                  }

                  // Single mode: apply slide animation
                  if (isExiting) return;
                  if (idx === currentQuestionIndex) {
                    setMiniBubbleOpen(false);
                    return;
                  }

                  if (idx > currentQuestionIndex) setSlideDirection("right");
                  else if (idx < currentQuestionIndex) setSlideDirection("left");

                  navLockRef.current = true;
                  setIsExiting(true);
                  setTimeout(() => {
                    setCurrentQuestionIndex(idx);
                    setIsExiting(false);
                    setMiniBubbleOpen(false);
                    // Unlock ngay sau khi đổi index (cho phép bấm tiếp)
                    setTimeout(() => {
                      navLockRef.current = false;
                    }, 150); // 150ms - cân bằng giữa tốc độ và độ mượt
                    // Reset slideDirection sau khi slideIn hoàn thành
                    setTimeout(() => {
                      setSlideDirection("none");
                    }, 400); // 400ms khớp với slideIn animation duration
                  }, 300); // 300ms khớp với slideOut animation duration
                }}
                isQuestionAnswered={isQuestionAnswered}
                isQuestionWrong={isQuestionWrong}
                uiMode={uiMode}
                markedQuestions={markedQuestions}
                bubbleOpen={miniBubbleOpen}
                setBubbleOpen={setMiniBubbleOpen}
                bubblePos={miniBubblePos}
                setBubblePos={setMiniBubblePos}
                isExiting={isExiting}
                quizTitle={quizTitle}
                elapsed={elapsed}
                formatElapsed={formatElapsed}
                handleSubmit={handleSubmit}
                displayMode={displayMode}
                setDisplayMode={setDisplayMode}
                setUiMode={setUiMode}
              />
            ) : (
              <div
                ref={minimapRef}
                className="flex overflow-x-auto snap-x no-scrollbar gap-2 p-4 -m-4 lg:m-0 lg:p-0 lg:pb-0 lg:grid lg:grid-cols-5 lg:overflow-visible"
              >
                {questions.map((question, index) => (
                  <button
                    key={question.id}
                    onClick={() => {
                      if (displayMode === "list") {
                        setCurrentQuestionIndex(index);
                        scrollToQuestion(question.id);
                        return;
                      }
                      if (isExiting) return;
                      if (index === currentQuestionIndex) return;

                      if (index > currentQuestionIndex) setSlideDirection("right");
                      else if (index < currentQuestionIndex) setSlideDirection("left");

                      navLockRef.current = true;
                      setIsExiting(true);
                      setTimeout(() => {
                        setCurrentQuestionIndex(index);
                        setIsExiting(false);
                        // Unlock ngay sau khi đổi index (cho phép bấm tiếp)
                        setTimeout(() => {
                          navLockRef.current = false;
                        }, 150); // 150ms - cân bằng giữa tốc độ và độ mượt
                        // Reset slideDirection sau khi slideIn hoàn thành
                        setTimeout(() => {
                          setSlideDirection("none");
                        }, 400); // 400ms khớp với slideIn animation duration
                      }, 300); // 300ms khớp với slideOut animation duration
                    }}
                    className={`flex-shrink-0 !w-10 !h-10 !min-w-[2.5rem] !min-h-[2.5rem] lg:!w-auto lg:!h-auto flex items-center justify-center p-0 lg:p-2 rounded-lg transition-all duration-200 border-2 text-xs sm:text-sm snap-center !transform-none
                    ${index === currentQuestionIndex
                        ? "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 dark:text-primary-400 dark:bg-primary-900/20 dark:shadow-lg dark:shadow-primary-500/25"
                        : uiMode === "instant" && isQuestionWrong(question)
                          ? "bg-red-600 text-white font-medium border-red-600 shadow-md shadow-red-600/20 dark:bg-red-900/40 dark:text-red-400 dark:border-red-500"
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
            )}
          </div>
        </div>
      </div>

      {/* Progress bar - chỉ hiển thị ngoài sidebar khi không ở chế độ danh sách */}
      {displayMode !== "list" && (
        <div className="mt-6 sm:mt-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Tiến độ làm bài: {questions.filter((q) => isQuestionAnswered(q)).length}/{questions.length}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {Math.round(
                (questions.filter((q) => isQuestionAnswered(q)).length / questions.length) *
                100
              )}
              %
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
              style={{
                width: `${(questions.filter((q) => isQuestionAnswered(q)).length / questions.length) * 100}%`,
              }}
            ></div>
          </div>
        </div>
      )}
      {/* Floating switch mode button for >=1024px - chỉ render khi viewport >= 1024px */}
      {
        isLarge && (
          <button
            onClick={() =>
              setUiMode((prev) => (prev === "default" ? "instant" : "default"))
            }
            className="hidden lg:flex fixed bottom-20 right-6 z-40 items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all duration-200 bg-white/90 dark:bg-gray-800/80 backdrop-blur border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-800"
            title="Chuyển đổi chế độ"
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
                ? "Chế độ: Xem ngay"
                : "Chế độ: Mặc định"}
            </span>
          </button>
        )
      }
      {
        isLarge && (
          <button
            onClick={() =>
              setDisplayMode((prev) => (prev === "single" ? "list" : "single"))
            }
            className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all duration-200 bg-white/90 dark:bg-gray-800/80 backdrop-blur border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-800"
            title="Chuyển đổi hiển thị"
          >
            {displayMode === "single" ? (
              <FaList className="w-4 h-4" />
            ) : (
              <FaLayerGroup className="w-4 h-4" />
            )}
            <span className="font-medium text-sm">
              {displayMode === "single"
                ? "Định dạng: Từng câu"
                : "Định dạng: Danh sách"}
            </span>
          </button>
        )
      }

      {/* Mode chooser dialog */}
      {
        showModeChooser && (
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
        )
      }
      {/* Image Modal for viewing viewing images fullscreen */}
      {
        viewingImage && (
          <ImageModal
            imageUrl={viewingImage}
            isOpen={!!viewingImage}
            onClose={() => setViewingImage(null)}
          />
        )
      }
      {/* Nút nộp cho chế độ danh sách (hiển thị cuối trang, không cố định viewport) */}
      {displayMode === "list" && (
        <div className="lg:hidden mt-8">
          <button
            onClick={handleSubmit}
            className="btn-primary w-full shadow-lg text-base sm:text-lg flex items-center justify-center gap-2 py-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Nộp bài
          </button>
        </div>
      )}
    </div >
  );
};

// Minimap dạng bong bóng cho chế độ danh sách trên mobile
function MobileMinimapBubble({
  questions,
  currentQuestionIndex,
  onSelect,
  isQuestionAnswered,
  isQuestionWrong,
  uiMode,
  markedQuestions,
  bubbleOpen,
  setBubbleOpen,
  bubblePos,
  setBubblePos,
  isExiting,
  quizTitle,
  elapsed,
  formatElapsed,
  handleSubmit,
  displayMode,
  setDisplayMode,
  setUiMode,
}: {
  questions: Question[];
  currentQuestionIndex: number;
  onSelect: (idx: number, id: string) => void;
  isQuestionAnswered: (q: Question) => boolean;
  isQuestionWrong: (q: Question) => boolean;
  uiMode: "default" | "instant";
  markedQuestions: string[];
  bubbleOpen: boolean;
  setBubbleOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bubblePos: { x: number; y: number };
  setBubblePos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  isExiting: boolean;
  quizTitle: string;
  elapsed: number;
  formatElapsed: (sec: number) => string;
  handleSubmit: () => void;
  displayMode: "single" | "list";
  setDisplayMode: (mode: "single" | "list") => void;
  setUiMode: (mode: "default" | "instant") => void;
}) {
  const bubbleRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pendingPosRef = React.useRef<{ x: number; y: number } | null>(null);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  // Viewport dimensions
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 390));
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  const isMobile = vw < 1024;

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const btnSize = 56;
  const panelWidth = Math.min(vw - 24, 460);
  const panelHeight = Math.min(vh - 80, 800); // Expand to nearly fill viewport
  const gap = 12;

  // Sync transform during drag to prevent double bubble on re-render
  useEffect(() => {
    if (bubbleRef.current && pendingPosRef.current) {
      const { x, y } = pendingPosRef.current;
      bubbleRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  });

  // Panel positioning (similar to ChatBox)
  const getPanelPos = () => {
    if (isMobile) {
      return { x: (vw - panelWidth) / 2, y: 40 };
    }

    // Desktop: position panel relative to button
    let panelX = bubblePos.x - panelWidth - gap;
    // Flip if overflow
    if (panelX < 8) {
      panelX = bubblePos.x + btnSize + gap;
    }
    if (panelX + panelWidth > vw - 8) {
      panelX = vw - panelWidth - 8;
    }

    let panelY = bubblePos.y;
    panelY = clamp(panelY, 8, vh - panelHeight - 8);

    return { x: panelX, y: panelY };
  };

  // Drag logic (matching ChatBox exactly)
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...bubblePos };
    let moved = false;
    let frameQueued = false;
    let nextX = startPos.x;
    let nextY = startPos.y;

    setIsDragging(true);

    const applyTransform = () => {
      frameQueued = false;
      pendingPosRef.current = { x: nextX, y: nextY };
      if (bubbleRef.current) {
        bubbleRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 3) moved = true;
      nextX = clamp(startPos.x + dx, 8, vw - btnSize - 8);
      nextY = clamp(startPos.y + dy, 8, vh - btnSize - 8);
      if (!frameQueued) {
        frameQueued = true;
        requestAnimationFrame(applyTransform);
      }
    };

    const onUp = (ev: PointerEvent) => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const latest = pendingPosRef.current ?? startPos;
      pendingPosRef.current = null;
      if (moved) {
        setBubblePos(latest);
      } else {
        // Click without drag: toggle
        setBubbleOpen((prev: boolean) => !prev);
      }
    };

    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch { }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
  };

  const panelPos = getPanelPos();

  const content = (
    <>
      {/* Backdrop (for both mobile and desktop to prevent click-through) */}
      {bubbleOpen && (
        <div
          className={`fixed inset-0 ${isMobile ? 'bg-black/30 backdrop-blur-sm' : 'bg-black/5'}`}
          style={{ zIndex: 9997 }}
          onClick={() => setBubbleOpen(false)}
        />
      )}

      {/* Floating button (matching ChatBox z-index: 9999) */}
      <button
        ref={bubbleRef}
        onPointerDown={handlePointerDown}
        className={`flex items-center justify-center rounded-full shadow-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white ${isDragging ? 'cursor-grabbing' : 'cursor-grab transition-all'
          } ${bubbleOpen ? 'opacity-0 pointer-events-none' : ''}`}
        aria-label="Mở minimap"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: `${btnSize}px`,
          height: `${btnSize}px`,
          transform: `translate3d(${bubblePos.x}px, ${bubblePos.y}px, 0)`,
          zIndex: 9999,
          touchAction: 'none',
          userSelect: 'none',
          willChange: 'transform'
        }}
      >
        <FaTh className="w-6 h-6" />
      </button>

      {/* Panel (matching ChatBox z-index: 9998) */}
      <div
        ref={panelRef}
        className={`card p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col ${bubbleOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: `${panelWidth}px`,
          maxHeight: `${panelHeight}px`,
          transform: `translate3d(${panelPos.x}px, ${panelPos.y}px, 0) ${bubbleOpen ? '' : 'scale(0.95)'}`,
          transition: isDragging ? 'none' : 'opacity 200ms ease-in-out, transform 200ms ease-in-out',
          zIndex: 9998,
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* Header: Quiz Title + Close */}
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1 mr-2">{quizTitle}</div>
          <button
            onClick={() => setBubbleOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats: Timer + Progress */}
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <FaRegClock className="w-3.5 h-3.5" />
              <span className="font-share-tech-mono">{formatElapsed(elapsed)}</span>
            </div>
            <div>
              <span className="font-medium">{questions.filter(isQuestionAnswered).length}</span>
              <span className="text-gray-500 dark:text-gray-500">/</span>
              <span>{questions.length}</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${(questions.filter(isQuestionAnswered).length / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Control Buttons (Format & Mode) */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setUiMode(uiMode === "default" ? "instant" : "default")}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-medium border border-gray-200 dark:border-gray-700"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" /><polyline points="1 20 1 14 7 14" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{uiMode === "instant" ? "Xem ngay" : "Mặc định"}</span>
          </button>

          <button
            onClick={() => {
              if (displayMode === "list") {
                setDisplayMode("single");
                setBubbleOpen(false); // Close minimap and effectively hide it as per logic
              } else {
                setDisplayMode("list");
              }
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-xs font-medium border border-gray-200 dark:border-gray-700"
          >
            <FaList className="w-3 h-3" />
            <span>{displayMode === "single" ? "Từng câu" : "Danh sách"}</span>
          </button>
        </div>

        {/* Question Grid with custom thin scrollbar */}
        <div
          className="grid gap-2 overflow-y-auto custom-thin-scrollbar flex-1 mb-3 content-start"
          style={{
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          }}
        >
          {questions.map((question, index) => (
            <button
              key={question.id}
              onClick={() => {
                if (isExiting) return;
                onSelect(index, question.id);
              }}
              className={`w-full !h-10 !min-h-[2.5rem] flex items-center !justify-center text-center rounded-lg transition-all duration-200 border-2 text-xs sm:text-sm p-0 !transform-none
                  ${index === currentQuestionIndex
                  ? "bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20 dark:text-primary-400 dark:bg-primary-900/20 dark:shadow-lg dark:shadow-primary-500/25"
                  : uiMode === "instant" && isQuestionWrong(question)
                    ? "bg-red-600 text-white font-medium border-red-600 shadow-md shadow-red-600/20 dark:bg-red-900/40 dark:text-red-400 dark:shadow-md dark:shadow-red-600/20"
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

        {/* Footer: Submit Button */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSubmit}
            className="w-full btn-primary flex items-center justify-center gap-2 py-2.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Nộp bài
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

// Wrap with React.memo to prevent unnecessary re-renders that cause double bubbles
const MemoizedMobileMinimapBubble = React.memo(MobileMinimapBubble);

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
    setDragOverTarget(null); // Reset dropdown/drag state
  }, [question.id]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside of any dropdown container
      const target = event.target as Element;
      if (!target.closest(".drag-question")) {
        // Close dropdowns if strictly outside drag-question area? 
        // Or just rely on re-clicking toggle.
        // Actually, let's close if we clicked outside the current open dropdown.
        // Implementation: we are using dragOverTarget for dropdown state (hacky but works if string is distinct)
        // But wait, dragOverTarget is also used for drag highlights logic ("pool" or t.id).
        // The previous commit used `dropdown-${t.id}` for open state.
        // We should ensure we don't clear it if we are clicking INSIDE it.

        // Ideally we check if we clicked a dropdown toggle or menu.
        // For simplicity: if we click anywhere that is NOT a button triggering a dropdown, close it?
        // Better: Let's assume if the user clicks *elsewhere* we close it.
        // Since I reused `dragOverTarget` state for the dropdown open state (to save adding new state),
        // I should be careful not to interfere with DnD state.
        // DnD sets `dragOverTarget` on dragOver.
        // Dropdown sets `dragOverTarget` on click.
        // This variable reuse is risky.
      }
      // Simple behavior: click anywhere else resets to null IF it starts with 'dropdown-'
      if (dragOverTarget && dragOverTarget.startsWith('dropdown-') && !target.closest('.relative.mb-3')) {
        setDragOverTarget(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dragOverTarget]);

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
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              disabled={reveal}
            >
              <span className="flex items-center gap-2 whitespace-pre-wrap text-left">
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
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white whitespace-pre-wrap">
                {t.label}
              </h3>
              <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ml-2">
                {(itemsByTarget[t.id] || []).length} đáp án
              </span>
            </div>

            {/* Custom Dropdown chọn đáp án */}
            {poolItems.length > 0 && (
              <div className="mb-3 relative">
                <button
                  disabled={reveal}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDragOverTarget((prev) => (prev === `dropdown-${t.id}` ? null : `dropdown-${t.id}`));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  className={`w-full py-2 px-3 flex items-center justify-center relative border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 ${dragOverTarget === `dropdown-${t.id}`
                    ? "ring-2 ring-primary-500 border-primary-500 shadow-md"
                    : "border-gray-400 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400"
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <span className="text-sm font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis px-4">-- Chọn đáp án --</span>
                  <svg
                    className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-transform duration-200 ${dragOverTarget === `dropdown-${t.id}` ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {dragOverTarget === `dropdown-${t.id}` && !reveal && (
                  <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden animate-fadeIn">
                    <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-3 py-2">
                      <p className="text-xs font-semibold text-white">
                        Chọn đáp án để thêm vào nhóm
                      </p>
                    </div>
                    <div className="p-1 max-h-60 overflow-y-auto custom-scrollbar">
                      {poolItems.map((it, idx) => (
                        <button
                          key={it.id}
                          onClick={() => {
                            assign(it.id, t.id);
                            setDragOverTarget(null);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group block"
                        >
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 whitespace-pre-wrap">
                            {it.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    <span className="flex items-center gap-2 whitespace-pre-wrap text-left">
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
}
export default QuizPage;
