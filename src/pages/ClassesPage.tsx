import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatDate } from "../utils/fileUtils";
import {
  TrashIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/solid";
import { ClassRoom, Quiz } from "../types";

// Helper functions
const isShortIdCode = (code: string) => /^[A-Z0-9]{6,8}$/.test(code);
const buildShortId = (id: string) => id.substring(0, 8).toUpperCase();
const extractId = (val: string, kind: "class" | "quiz") => {
  const marker = `/${kind}/`;
  const idx = val.indexOf(marker);
  if (idx >= 0) return val.substring(idx + marker.length).split(/[?#/]/)[0];
  return val;
};

const ClassesPage: React.FC = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Statistics
  const [statsCompleted, setStatsCompleted] = useState(0);
  const [statsAverage, setStatsAverage] = useState<number>(0);

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState<{
    type: "class" | "quiz";
    id: string;
    code?: string;
  } | null>(null);

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [importType, setImportType] = useState<"auto" | "class" | "quiz">(
    "auto"
  );
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);

  // Share status tracking (classId/quizId -> isShareable)
  const [shareStatus, setShareStatus] = useState<Record<string, boolean>>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  // Track expanded classes (desktop + mobile)
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'>('date-desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleClassExpansion = (classId: string) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [classId]: !prev[classId],
    }));
  };

  const filteredClasses = classes.filter((cls) => {
    const query = searchQuery.toLowerCase();
    const matchClass = cls.name.toLowerCase().includes(query);
    const matchClassDescription = cls.description && cls.description.toLowerCase().includes(query);
    const matchQuiz =
      Array.isArray(cls.quizzes) &&
      cls.quizzes.some(
        (q) => typeof q !== "string" && (
          q.title.toLowerCase().includes(query) ||
          (q.description && q.description.toLowerCase().includes(query))
        )
      );
    return matchClass || matchClassDescription || matchQuiz;
  });

  // Hàm xóa lớp học
  const handleDeleteClass = async (classId: string, className: string) => {
    if (
      window.confirm(
        `Bạn có chắc chắn muốn xóa lớp học "${className}"?\n\nLưu ý: Nếu là lớp được chia sẻ, thao tác này chỉ gỡ lớp khỏi danh sách của bạn.`
      )
    ) {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập để thực hiện thao tác.");
          return;
        }
        const { ClassesAPI, VisibilityAPI } = await import("../utils/api");
        const cls = classes.find((c) => c.id === classId) as any;
        const isShared = cls && cls.accessType === "shared";
        if (isShared) {
          await VisibilityAPI.removeAccess({ classId }, token);
        } else {
          await ClassesAPI.remove(classId, token);
        }
        setClasses((prev) => prev.filter((cls) => cls.id !== classId));
        alert(`Đã xóa lớp học "${className}" thành công!`);
      } catch (error) {
        // console.error("Error deleting class:", error);
        alert("Có lỗi xảy ra khi xóa lớp học. Vui lòng thử lại.");
      }
    }
  };

  // Hàm xóa quiz khỏi lớp học
  const handleDeleteQuiz = async (
    classId: string,
    quizId: string,
    quizTitle: string
  ) => {
    if (
      window.confirm(
        `Bạn có chắc chắn muốn xóa bài kiểm tra "${quizTitle}"?\n\nLưu ý: Nếu là bài được chia sẻ, thao tác này chỉ gỡ khỏi danh sách của bạn.`
      )
    ) {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập để thực hiện thao tác.");
          return;
        }
        const { QuizzesAPI, VisibilityAPI } = await import("../utils/api");
        const host = classes.find((c) => c.id === classId) as any;
        const isShared = host && host.accessType === "shared";
        if (isShared) {
          await VisibilityAPI.removeAccess({ quizId }, token);
        } else {
          await QuizzesAPI.remove(quizId, token);
        }
        // Cập nhật state cục bộ
        setClasses((prev) =>
          prev.map((cls) => {
            if (cls.id === classId) {
              return {
                ...cls,
                quizzes:
                  (cls.quizzes as Quiz[])?.filter(
                    (quiz) => quiz.id !== quizId
                  ) || [],
              };
            }
            return cls;
          })
        );
        alert(`Đã xóa bài kiểm tra "${quizTitle}" thành công!`);
      } catch (error) {
        // error("Error deleting quiz:", error);
        alert("Có lỗi xảy ra khi xóa bài kiểm tra. Vui lòng thử lại.");
      }
    }
  };

  // Handle dropdown toggle
  const handleDropdownToggle = (classId: string) => {
    if (openDropdown === classId) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(classId);
    }
  };

  // Toggle public for class
  const handleToggleClassPublic = async (classId: string, current: boolean) => {
    const newState = !current;
    const message = newState
      ? "📢 Đặt Class Public?\n\n✓ Class sẽ Public\n✓ TẤT CẢ Quiz sẽ Public\n✓ Sau đó có thể đặt Private từng Quiz"
      : "🔒 Đặt Class Private?\n\n✓ Class sẽ Private\n✓ Các Quiz Public → Private\n✓ Các Quiz Private → giữ nguyên";

    if (!window.confirm(message)) return;

    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
      const { VisibilityAPI } = await import("../utils/api");

      // Toggle class public state - backend will sync quizzes accordingly
      await VisibilityAPI.publicToggle(
        { targetType: "class", targetId: classId, enabled: newState },
        token
      );

      // Reload classes to sync all quiz published states and icons
      setLoading(true);
      await loadMyClasses();

      const successMsg = newState
        ? "✅ Đã Public Class và TẤT CẢ Quiz\n\n💡 Bạn có thể Private từng Quiz sau"
        : "✅ Đã Private Class\n\n• Quiz Public → Private\n• Quiz Private → giữ nguyên";
      alert(successMsg);
    } catch (e) {
      // console.error("toggle public failed", e);
      alert("❌ Không thể cập nhật trạng thái");
    }
  };

  const handleShareClass = async (classId: string) => {
    let code = "";
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (token) {
        const { VisibilityAPI } = await import("../utils/api");
        await VisibilityAPI.shareToggle(
          { targetType: "class", targetId: classId, enabled: true },
          token
        );
        // Fetch the code
        const status = await VisibilityAPI.getShareStatus("class", classId, token);
        if (status && status.code) code = status.code;
      }
    } catch { }
    setShareData({ type: "class", id: classId, code });
    setShareOpen(true);
  };

  const handleShareQuiz = async (quizId: string) => {
    let code = "";
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (token) {
        const { VisibilityAPI } = await import("../utils/api");
        await VisibilityAPI.shareToggle(
          { targetType: "quiz", targetId: quizId, enabled: true },
          token
        );
        // Fetch the code
        const status = await VisibilityAPI.getShareStatus("quiz", quizId, token);
        if (status && status.code) code = status.code;
      }
    } catch { }
    setShareData({ type: "quiz", id: quizId, code });
    setShareOpen(true);
  };

  // Toggle share for class - GIỐNG LOGIC PUBLIC/PRIVATE
  const handleToggleClassShare = async (classId: string, current: boolean) => {
    const newState = !current;
    const message = newState
      ? "🔗 Bật chia sẻ Class?\n\n✓ Class có thể chia sẻ\n✓ TẤT CẢ Quiz có thể chia sẻ\n\n🎯 Quy tắc truy cập:\n• Người nhập ID/Link CLASS → truy cập TẤT CẢ Quiz\n• Người nhập ID/Link QUIZ → chỉ truy cập Quiz đó"
      : "🔒 Tắt chia sẻ Class?\n\n✓ Class không thể chia sẻ\n✓ Các Quiz đang chia sẻ → tắt\n✓ Các Quiz đã tắt → giữ nguyên\n\n⚠️ Người đã nhập ID/Link Class sẽ MẤT quyền truy cập";

    if (!window.confirm(message)) return;

    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
      const { VisibilityAPI } = await import("../utils/api");

      // Toggle class share state - backend will sync quizzes accordingly
      await VisibilityAPI.shareToggle(
        { targetType: "class", targetId: classId, enabled: newState },
        token
      );

      // Reload classes to sync all quiz share states and icons
      setLoading(true);
      await loadMyClasses();

      const successMsg = newState
        ? "✅ Đã bật chia sẻ Class và TẤT CẢ Quiz\n\n🎯 Quyền truy cập:\n• Nhập ID/Link Class → ALL Quiz\n• Nhập ID/Link Quiz → CHỈ quiz đó"
        : "✅ Đã tắt chia sẻ Class\n\n• Quiz đang chia sẻ → tắt\n• Quiz đã tắt → giữ nguyên";
      alert(successMsg);
    } catch (e) {
      // console.error("toggle share failed", e);
      alert("❌ Không thể cập nhật trạng thái chia sẻ");
    }
  };

  // Toggle share for quiz - GIỐNG LOGIC PUBLIC/PRIVATE
  const handleToggleQuizShare = async (quizId: string, current: boolean) => {
    const newState = !current;
    const message = newState
      ? "🔗 Bật chia sẻ Quiz?\n\n✓ Quiz có thể chia sẻ\n✓ Class có thể chia sẻ (nếu đang tắt)\n✓ Quiz khác GIỮ NGUYÊN\n\n🎯 Quyền truy cập:\n• Người nhập ID/Link QUIZ này → CHỈ Quiz này\n• Người nhập ID/Link Class → TẤT CẢ Quiz"
      : "🔒 Tắt chia sẻ Quiz?\n\n✓ CHỈ Quiz này tắt chia sẻ riêng lẻ\n✓ Class giữ nguyên có thể chia sẻ\n\n⚠️ LƯU Ý:\n• Người đã nhập ID/Link QUIZ này → MẤT quyền ✗\n• Người đã nhập ID/Link CLASS → VẪN truy cập được ✓\n\n💡 Muốn revoke hoàn toàn? Tắt share CLASS!";

    if (!window.confirm(message)) return;

    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
      const { VisibilityAPI } = await import("../utils/api");

      // Toggle share state for quiz via visibility API
      await VisibilityAPI.shareToggle(
        { targetType: "quiz", targetId: quizId, enabled: newState },
        token
      );

      // Reload classes to sync quiz and class states and update icons
      setLoading(true);
      await loadMyClasses();

      const message = newState
        ? "✅ Đã bật chia sẻ Quiz\n\n🎯 Quyền truy cập:\n• Nhập ID/Link Quiz → CHỈ Quiz này\n• Nhập ID/Link Class → TẤT CẢ Quiz"
        : "✅ Đã tắt chia sẻ Quiz riêng lẻ\n\n⚠️ LƯU Ý:\n• User đã claim Quiz này → MẤT quyền ✗\n• User đã claim Class → VẪN truy cập ✓";
      alert(message);
    } catch (e) {
      // console.error("toggle share failed", e);
      alert("❌ Không thể cập nhật trạng thái chia sẻ");
    }
  };

  // Toggle publish for quiz: if publishing and class is private -> make class public, but only this quiz is published
  const handleToggleQuizPublished = async (
    quizId: string,
    current: boolean
  ) => {
    const newState = !current;
    const message = newState
      ? "📢 Public Quiz?\n\n✓ Quiz sẽ Public\n✓ Class sẽ Public (nếu đang Private)\n✓ Quiz khác GIỮ NGUYÊN"
      : "🔒 Private Quiz?\n\n✓ CHỈ Quiz này Private\n✓ Class giữ nguyên Public";

    if (!window.confirm(message)) return;

    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
      const { VisibilityAPI } = await import("../utils/api");

      // Toggle public state for quiz via visibility API
      await VisibilityAPI.publicToggle(
        { targetType: "quiz", targetId: quizId, enabled: newState },
        token
      );

      // Reload classes to sync quiz and class states and update icons
      setLoading(true);
      await loadMyClasses();

      const message = newState
        ? "✅ Đã Public Quiz\n\n• Quiz Public\n• Class Public\n• Quiz khác giữ nguyên"
        : "✅ Đã Private Quiz\n\n• Chỉ Quiz này Private\n• Class giữ Public";
      alert(message);
    } catch (e) {
      // console.error("toggle publish failed", e);
      alert("❌ Không thể cập nhật trạng thái");
    }
  };

  // Helper: get valid quizzes in a class
  const getValidQuizzes = (classRoom: ClassRoom): Quiz[] => {
    if (!classRoom.quizzes) return [];
    const quizzes = classRoom.quizzes as Quiz[];
    const validQuizzes = quizzes.filter(
      (quiz) => quiz && (quiz as any).id && (quiz as any).title
    );
    return validQuizzes;
  };

  // Helper to load stats
  const loadStats = async (classesToProcess: ClassRoom[]) => {
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { StatsAPI } = await import("../utils/api");

      const stats = await StatsAPI.getProfileStats(token);
      setStatsCompleted(stats.quizzesTaken || 0);
      setStatsAverage(stats.averageScore || 0);
    } catch (e) {
      // console.error("Stats error", e);
    }
  };

  // Fetch classes helper (Fallback)
  const loadMyClasses = async () => {
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;

      const { ClassesAPI, QuizzesAPI } = await import("../utils/api");

      // Fetch classes
      const classesData = await ClassesAPI.listMine(token);

      // Fetch quizzes for each class
      const classesWithQuizzes = await Promise.all(
        classesData.map(async (cls: any) => {
          const quizzes = await QuizzesAPI.byClass(cls.id, token);
          return { ...cls, quizzes };
        })
      );

      // Sort by createdAt descending (newest first)
      classesWithQuizzes.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setClasses(classesWithQuizzes);
      await loadStats(classesWithQuizzes);

      // === [PHẦN SỬA LỖI] ===
      // Cập nhật trạng thái chia sẻ cho cả Class và Quiz với key đúng format
      const statusMap: Record<string, boolean> = {};
      classesWithQuizzes.forEach((c: any) => {
        // 1. Check Class (dùng key 'class_ID')
        // Kiểm tra nếu lớp ĐANG ĐƯỢC MÌNH CHIA SẺ (isShared) hoặc MÌNH ĐƯỢC CHIA SẺ (accessType='shared')
        if (c.isShared || c.accessType === 'shared') {
          statusMap[`class_${c.id}`] = true;
        }

        // 2. Check Quiz (dùng key 'quiz_ID')
        if (Array.isArray(c.quizzes)) {
          c.quizzes.forEach((q: any) => {
            if (q.isShared) {
              statusMap[`quiz_${q.id}`] = true;
            }
          });
        }
      });
      setShareStatus(statusMap);
      // =======================

    } catch (err) {
      // error("Error fetching classes:", err);
    } finally {
      setLoading(false);
    }
  };

  // Lấy dữ liệu từ backend
  useEffect(() => {
    loadMyClasses();
  }, []);

  // Handle click outside để đóng dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".dropdown-container")) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle click outside for Import Type dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".import-type-dropdown")) {
        setIsImportDropdownOpen(false);
      }
    };
    if (isImportDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isImportDropdownOpen]);

  const buildShareLink = (type: "class" | "quiz", id: string, code?: string) =>
    `${window.location.origin}/${type === "class" ? "class" : "quiz"}/${code || id}`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch { }
  };

  const handleImport = async () => {
    const raw = importInput.trim();
    if (!raw) {
      alert("Vui lòng nhập ID hoặc Link");
      return;
    }
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
      const { ClassesAPI, QuizzesAPI } = await import("../utils/api");

      const extractId = (val: string, kind: "class" | "quiz") => {
        const marker = `/${kind}/`;
        const idx = val.indexOf(marker);
        if (idx >= 0)
          return val.substring(idx + marker.length).split(/[?#/]/)[0];
        return val;
      };

      let usedType: "class" | "quiz" | null = null;
      let payload: { classId?: string; quizId?: string; code?: string } = {};
      let didImport = false;

      // Fallback: clone from public by frontend if backend import route is unavailable
      const doClientClone = async (kind: "class" | "quiz", id: string) => {
        const { ClassesAPI, QuizzesAPI } = await import("../utils/api");
        const sanitize = (raw: string, kindHint: "class" | "quiz") => {
          if (!raw) return raw;
          if (raw.startsWith("http")) {
            const marker = kindHint === "class" ? "/class/" : "/quiz/";
            const idx = raw.indexOf(marker);
            if (idx >= 0)
              return raw.substring(idx + marker.length).split(/[?#/]/)[0];
          }
          return raw;
        };
        const normId = sanitize(id, kind);
        // Load all public classes to find source
        const mine = await ClassesAPI.listMine(token).catch(() => []);
        const pub = await ClassesAPI.listPublic(token).catch(() => []);
        const all = [...pub, ...mine];

        if (kind === "class") {
          const src = all.find((c: any) => c.id === normId);
          // Fetch quizzes of source class even if class meta not found in lists
          const qzs = await QuizzesAPI.byClass(
            src ? src.id : normId,
            token
          ).catch(() => []);
          if (!src && (!qzs || qzs.length === 0))
            throw new Error("Không tìm thấy lớp học nguồn");
          // Create new class under current user (private)
          const { ClassesAPI: CAPI } = await import("../utils/api");
          const created = await CAPI.create(
            {
              name: src?.name || "Lớp đã nhập",
              description: src?.description || "",
              isPublic: false,
            },
            token
          );
          // Clone quizzes (private)
          for (const q of qzs) {
            await QuizzesAPI.create(
              {
                classId: created.id,
                title: q.title,
                description: q.description || "",
                questions: q.questions || [],
                published: false,
              },
              token
            ).catch(() => null);
          }
          didImport = true;
        } else {
          // kind === 'quiz'
          // Use new API to get quiz directly by ID (supports published quizzes)
          const quizData = await QuizzesAPI.getById(normId, token).catch(
            () => null
          );
          if (!quizData)
            throw new Error(
              "Không tìm thấy quiz nguồn hoặc quiz chưa xuất bản"
            );

          // Create new class under current user (private)
          const className = quizData.class?.name || "Lớp đã nhập";
          const classDesc = quizData.class?.description || "";
          const created = await ClassesAPI.create(
            { name: className, description: classDesc, isPublic: false },
            token
          );

          // Clone only this quiz (private)
          await QuizzesAPI.create(
            {
              classId: created.id,
              title: quizData.title,
              description: quizData.description || "",
              questions: quizData.questions || [],
              published: false,
            },
            token
          );
          didImport = true;
        }
      };

      const rawUpper = raw.toUpperCase();
      if (isShortIdCode(rawUpper)) {
        // Resolve short code by scanning public, mine, and shared items
        const mine = await ClassesAPI.listMine(token).catch(() => []);
        const pub = await ClassesAPI.listPublic(token).catch(() => []);
        const { VisibilityAPI } = await import("../utils/api");
        const sharedClasses = await VisibilityAPI.listSharedClasses(
          token
        ).catch(() => []);
        const sharedQuizzes = await VisibilityAPI.listSharedQuizzes(
          token
        ).catch(() => []);

        const allClasses = [...pub, ...mine, ...sharedClasses];
        let foundClassId: string | null = null;
        for (const c of allClasses) {
          if (buildShortId(c.id).toUpperCase() === rawUpper) {
            foundClassId = c.id;
            break;
          }
        }
        if (foundClassId) {
          payload.classId = foundClassId;
          usedType = "class";
        } else {
          // search quizzes under classes
          for (const c of allClasses) {
            const qzs = await QuizzesAPI.byClass(c.id, token).catch(() => []);
            const matched = qzs.find(
              (q: any) => buildShortId(q.id).toUpperCase() === rawUpper
            );
            if (matched) {
              payload.quizId = matched.id;
              usedType = "quiz";
              break;
            }
          }
          // also check shared quizzes directly
          if (!usedType) {
            const matched = sharedQuizzes.find(
              (q: any) => buildShortId(q.id).toUpperCase() === rawUpper
            );
            if (matched) {
              payload.quizId = matched.id;
              usedType = "quiz";
            }
          }
        }
        if (!usedType) throw new Error("Không tìm thấy nội dung với mã này");
      } else if (
        importType === "class" ||
        (importType === "auto" && /\/class\//.test(raw))
      ) {
        const idPart = extractId(raw, "class");
        if (isShortIdCode(idPart.toUpperCase())) {
          // treat as short code embedded in link
          const mine = await ClassesAPI.listMine(token).catch(() => []);
          const pub = await ClassesAPI.listPublic(token).catch(() => []);
          const { VisibilityAPI } = await import("../utils/api");
          const sharedClasses = await VisibilityAPI.listSharedClasses(
            token
          ).catch(() => []);
          const all = [...pub, ...mine, ...sharedClasses];
          const code = idPart.toUpperCase();
          let found: string | null = null;
          for (const c of all) {
            if (buildShortId(c.id).toUpperCase() === code) {
              found = c.id;
              break;
            }
          }
          if (found) {
            payload.classId = found;
            usedType = "class";
          } else throw new Error("Không tìm thấy lớp học với mã này");
        } else {
          payload.classId = idPart;
          usedType = "class";
        }
      } else if (
        importType === "quiz" ||
        (importType === "auto" && /\/quiz\//.test(raw))
      ) {
        const idPart = extractId(raw, "quiz");
        if (isShortIdCode(idPart.toUpperCase())) {
          const mine = await ClassesAPI.listMine(token).catch(() => []);
          const pub = await ClassesAPI.listPublic(token).catch(() => []);
          const { VisibilityAPI } = await import("../utils/api");
          const sharedClasses = await VisibilityAPI.listSharedClasses(
            token
          ).catch(() => []);
          const sharedQuizzes = await VisibilityAPI.listSharedQuizzes(
            token
          ).catch(() => []);
          const all = [...pub, ...mine, ...sharedClasses];
          const code = idPart.toUpperCase();
          let found: string | null = null;
          outer: for (const c of all) {
            const qzs = await QuizzesAPI.byClass(c.id, token).catch(() => []);
            for (const q of qzs) {
              if (buildShortId(q.id).toUpperCase() === code) {
                found = q.id;
                break outer;
              }
            }
          }
          // also check shared quizzes directly
          if (!found) {
            const matched = sharedQuizzes.find(
              (q: any) => buildShortId(q.id).toUpperCase() === code
            );
            if (matched) found = matched.id;
          }
          if (found) {
            payload.quizId = found;
            usedType = "quiz";
          } else throw new Error("Không tìm thấy quiz với mã này");
        } else {
          payload.quizId = idPart;
          usedType = "quiz";
        }
      } else if (raw.toUpperCase().startsWith("LIGMA")) {
        payload.code = raw;
        usedType = "class";
      } else if (raw.toUpperCase().startsWith("SUGMA")) {
        payload.code = raw;
        usedType = "quiz";
      } else {
        // Unknown format, try quiz then class (one-shot)
        // Only if NOT looking like a code
        try {
          await ClassesAPI.import({ quizId: raw }, token);
          didImport = true;
        } catch {
          await ClassesAPI.import({ classId: raw }, token);
          didImport = true;
        }
      }

      if (!didImport && usedType && (payload.classId || payload.quizId || payload.code)) {
        try {
          try {
            const { VisibilityAPI } = await import("../utils/api");
            await VisibilityAPI.claim(payload as any, token);
            didImport = true;
            // Refresh list
            // setRefresh(prev => !prev);
          } catch (err: any) {
            // Only fallback to import if it was an ID-based lookup, NOT a code claim
            if (!payload.code) {
              try {
                await ClassesAPI.import(payload, token);
                didImport = true;
              } catch {
                // Ignore import error, throw original claim error or generic
                throw err;
              }
            } else {
              // It was a code claim and it failed (e.g. 404/403)
              // Do NOT try import (which would just multiple 404s)
              console.error(err);
              throw new Error("Mã truy cập không hợp lệ hoặc đã hết hạn (Code Invalid)");
            }
          }
        } catch (err2: any) {
          // Backend route missing -> fallback to client clone
          if (usedType === "class" && payload.classId) {
            await doClientClone("class", payload.classId);
            didImport = true;
          } else if (usedType === "quiz" && payload.quizId) {
            await doClientClone("quiz", payload.quizId);
            didImport = true;
          } else {
            throw err2;
          }
        }
      }

      if (!didImport)
        throw new Error(
          "Không thể nhập. Vui lòng kiểm tra ID/Link và thử lại."
        );

      alert("Đã nhập thành công");
      setImportOpen(false);
      setImportInput("");
      setImportType("auto");
      setLoading(true);
      await loadMyClasses();
    } catch (e: any) {
      // console.error("Import failed", e);
      alert(
        e?.message || "Không thể nhập. Vui lòng kiểm tra ID/Link và thử lại."
      );
    }
  };

  return (
    <div>
      {/* Hero Section (Unified) */}
      <div className="mb-8 lg:mb-12 w-full relative overflow-hidden group bg-gradient-to-bl from-blue-600 via-blue-700 to-blue-900 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 shadow-2xl animate-slideDownIn">
        {/* Decorative elements */}
        {/* <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div> */}
        {/* <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div> */}
        {/* Overlay pattern */}
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_#fff_1px,_transparent_0)] bg-[size:24px_24px] rounded-2xl pointer-events-none"></div>
        {/* Shimmer effect */}
        <div
          className="
              absolute inset-0
              opacity-30
              bg-gradient-to-r from-transparent via-white/65 to-transparent
              blur-[3px]
              animate-[shimmer_3s_ease-in-out_infinite]
              [mask-image:linear-gradient(to_right,transparent_0%,black_20%,black_80%,transparent_100%)]
              mix-blend-overlay
              rounded-2xl pointer-events-none
            "
        ></div>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-mono font-bold text-white mb-4 tracking-tight text-center lg:text-left">
            Lớp học của tôi
          </h1>
          <p className="text-base font-mono sm:text-lg text-blue-100 dark:text-blue-200 max-w-2xl leading-relaxed text-center lg:text-left mx-auto lg:mx-0">
            Nhập ID để tham gia lớp học được chia sẻ
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile Stats (only visible on mobile) */}
        <div className="lg:hidden mb-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Ô 1: Lớp học */}
            <div
              className="
                  relative bg-white border border-gray-200 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-left
                  transition-all duration-500
                  dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                  dark:border-white/10 dark:ring-1 dark:ring-white/10
                  overflow-hidden group isolate
                "
              style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
            >
              {/* Overlay pattern: vân chéo */}
              <div
                className="
                    absolute inset-0 opacity-10
                    bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)]
                    dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)]
                    rounded-xl pointer-events-none
                  "
              />

              {/* Hiệu ứng shimmer ánh bạc */}
              <div
                className="
                    absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000
                    bg-gradient-to-r from-transparent via-white/80 to-transparent
                    translate-x-[-100%] group-hover:translate-x-[100%]
                    blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite]
                    rounded-xl mix-blend-overlay pointer-events-none
                  "
              />

              {/* Bóng sáng trung tâm */}
              <div
                className="
                    absolute inset-0 pointer-events-none
                    bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_70%)]
                    dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_70%)]
                    rounded-xl
                  "
              />

              <div className="relative flex items-center justify-between gap-2">
                <div className="text-xs sm:text-sm font-mono text-blue-600 dark:text-gray-200">
                  Lớp học
                </div>
                <div className="text-lg sm:text-xl font-mono font-bold text-blue-600 dark:text-gray-50">
                  {classes.length}
                </div>
              </div>
            </div>

            {/* Ô 2: Bài kiểm tra */}
            <div
              className="
                  relative bg-white border border-gray-200 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-left
                  transition-all duration-500
                  dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                  dark:border-white/10 dark:ring-1 dark:ring-white/10
                  overflow-hidden group isolate
                "
              style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
            >
              <div
                className="
                    absolute inset-0 opacity-10
                    bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)]
                    dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)]
                    rounded-xl pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000
                    bg-gradient-to-r from-transparent via-white/80 to-transparent
                    translate-x-[-100%] group-hover:translate-x-[100%]
                    blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite]
                    rounded-xl mix-blend-overlay pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 pointer-events-none
                    bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_70%)]
                    dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_70%)]
                    rounded-xl
                  "
              />

              <div className="relative flex items-center justify-between gap-2">
                <div className="text-xs sm:text-sm font-mono text-blue-600 dark:text-gray-200">
                  Bài kiểm tra
                </div>
                <div className="text-lg sm:text-xl font-mono font-bold text-blue-600 dark:text-gray-50">
                  {classes.reduce(
                    (total, cls) => total + getValidQuizzes(cls).length,
                    0
                  )}
                </div>
              </div>
            </div>

            {/* Ô 3: Đã hoàn thành */}
            <div
              className="
                  relative bg-white border border-gray-200 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-left
                  transition-all duration-500
                  dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                  dark:border-white/10 dark:ring-1 dark:ring-white/10
                  overflow-hidden group isolate
                "
              style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
            >
              <div
                className="
                    absolute inset-0 opacity-10
                    bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)]
                    dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)]
                    rounded-xl pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000
                    bg-gradient-to-r from-transparent via-white/80 to-transparent
                    translate-x-[-100%] group-hover:translate-x-[100%]
                    blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite]
                    rounded-xl mix-blend-overlay pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 pointer-events-none
                    bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_70%)]
                    dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_70%)]
                    rounded-xl
                  "
              />

              <div className="relative flex items-center justify-between gap-2">
                <div className="text-xs sm:text-sm font-mono text-blue-600 dark:text-gray-200">
                  Đã hoàn thành
                </div>
                <div className="text-lg sm:text-xl font-mono font-bold text-blue-600 dark:text-gray-50">
                  {statsCompleted}
                </div>
              </div>
            </div>

            {/* Ô 4: Điểm trung bình */}
            <div
              className="
                  relative bg-white border border-gray-200 rounded-xl py-2.5 px-3 sm:py-3 sm:px-4 text-left
                  transition-all duration-500
                  dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                  dark:border-white/10 dark:ring-1 dark:ring-white/10
                  overflow-hidden group isolate
                "
              style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
            >
              <div
                className="
                    absolute inset-0 opacity-10
                    bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)]
                    dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)]
                    rounded-xl pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000
                    bg-gradient-to-r from-transparent via-white/80 to-transparent
                    translate-x-[-100%] group-hover:translate-x-[100%]
                    blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite]
                    rounded-xl mix-blend-overlay pointer-events-none
                  "
              />
              <div
                className="
                    absolute inset-0 pointer-events-none
                    bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_70%)]
                    dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_70%)]
                    rounded-xl
                  "
              />

              <div className="relative flex items-center justify-between gap-2">
                <div className="text-xs sm:text-sm font-mono text-blue-600 dark:text-gray-200">
                  Điểm trung bình
                </div>
                <div className="text-lg sm:text-xl font-mono font-bold text-blue-600 dark:text-gray-50">
                  {statsAverage}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pb-8 sm:pb-12">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* Left Section - Main Content */}
            <div className="lg:w-[70%] min-w-0 order-1">



              <div className="flex gap-2 mb-6 justify-between">
                {/* Import Button */}
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex-1 lg:flex-none lg:w-auto group relative inline-flex items-center justify-center gap-2 max-[368px]:gap-1 px-5 py-2.5 max-[368px]:px-2 max-[368px]:py-1.5 rounded-lg text-sm max-[368px]:text-[11px] font-mono font-bold text-blue-900 dark:text-blue-100 bg-white dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-700/50 hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-white transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md"
                  title="Nhập ID/Link lớp học hoặc quiz"
                >
                  {/* Texture effect overlay - Diagonal Stripes */}
                  <div className="absolute inset-0 opacity-[0.1] dark:opacity-[0.05] bg-[repeating-linear-gradient(45deg,#3b82f6_0px,#3b82f6_1px,transparent_1px,transparent_8px)]" />

                  {/* Hover shimmer */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-blue-100/50 dark:via-blue-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-all duration-700 ease-in-out" />

                  <span className="relative z-10 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 max-[368px]:w-3.5 max-[368px]:h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span className="hidden min-[571px]:inline">Nhập ID/Link</span>
                    <span className="inline min-[571px]:hidden">Nhập ID</span>
                  </span>
                </button>

                {/* Filter Button */}
                <div className="relative flex-none lg:flex-none" ref={sortMenuRef}>
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="h-full w-auto lg:w-auto inline-flex items-center justify-center gap-0 lg:gap-2 px-2.5 lg:px-4 py-2.5 rounded-lg text-sm font-mono font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600 active:scale-95 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h14M3 10h10M3 15h10M17 10v10m0 0l-3-3m3 3l3-3" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  <div className={`absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] overflow-hidden transition-all duration-200 ease-out origin-top-left ${showSortMenu ? 'opacity-100 scale-100 translate-y-0 visible pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}`}>
                    {[
                      { id: 'date-desc' as const, label: 'Mới nhất' },
                      { id: 'date-asc' as const, label: 'Cũ nhất' },
                      { id: 'name-asc' as const, label: 'Tên (A → Z)' },
                      { id: 'name-desc' as const, label: 'Tên (Z → A)' }
                    ].map(option => (
                      <button
                        key={option.id}
                        onClick={() => { setSortBy(option.id); setShowSortMenu(false); }}
                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${sortBy === option.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                          }`}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.id && (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Button */}
                <button
                  onClick={() => setShowMobileSearch(!showMobileSearch)}
                  className={`flex-1 lg:hidden group relative inline-flex items-center border-2 border-gray-200 dark:border-gray-800 justify-center gap-2 max-[368px]:gap-1 px-5 py-2.5 max-[368px]:px-2 max-[368px]:py-1.5 rounded-lg text-sm max-[368px]:text-[11px] font-bold transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md ${showMobileSearch
                    ? "text-white bg-primary-500"
                    : "text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:text-primary-600 dark:hover:text-primary-400"
                    }`}
                >
                  <MagnifyingGlassIcon className={`w-5 h-5 max-[368px]:w-3.5 max-[368px]:h-3.5 transition-colors duration-300 ${showMobileSearch ? "text-white" : "text-gray-400 group-hover:text-primary-500"}`} />
                  Tìm kiếm
                </button>
              </div>

              {/* Collapsible Mobile Search Input */}
              <div className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${showMobileSearch ? "max-h-20 mb-6 opacity-100" : "max-h-0 mb-0 opacity-0"}`}>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Tìm kiếm lớp học, bài kiểm tra..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-gray-800 rounded-lg focus:ring-0 outline-none transition-all shadow-sm"
                    autoFocus
                  />
                  <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="py-8 flex items-center justify-center">
                  {(() => {
                    const SpinnerLoading = require("../components/SpinnerLoading").default;
                    return <div style={{ transform: 'scale(0.435)' }}><SpinnerLoading /></div>;
                  })()}
                </div>
              ) : classes.length > 0 ? (
                // Danh sách lớp học
                <div className="space-y-4">
                  {[...filteredClasses]
                    .sort((a, b) => {
                      switch (sortBy) {
                        case 'name-asc':
                          return a.name.localeCompare(b.name);
                        case 'name-desc':
                          return b.name.localeCompare(a.name);
                        case 'date-desc':
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        case 'date-asc':
                          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                        default:
                          return 0;
                      }
                    })
                    .map((classRoom: ClassRoom, index) => {
                      const validQuizzes = getValidQuizzes(classRoom);
                      const quizCount = validQuizzes.length;

                      return (
                        <div
                          key={classRoom.id}
                          className={`
                      group relative card p-4 sm:p-6 hover:shadow-2xl transition-all duration-300
                      border-l-4 border-l-gray-300 dark:border-l-gray-600
                      hover:border-l-primary-500 dark:hover:border-l-primary-500
                      ${openDropdown === classRoom.id
                              ? "shadow-2xl scale-[1.01] border-l-primary-500 bg-blue-50/50 dark:bg-gray-700/50 z-10"
                              : "hover:scale-[1.005]"
                            } animate-slideUpIn anim-delay-100
                    `}
                          style={{ animationDelay: `${(index % 5) * 0.1}s` }}
                        // onMouseLeave={() =>
                        //   openDropdown === classRoom.id && setOpenDropdown(null)
                        // }
                        >
                          {/* Desktop Layout - flex ngang */}
                          <div className="hidden sm:flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <div className="flex items-start gap-3 mb-3">
                                {/* Avatar với chữ cái đầu tiên (New Luxury Style) */}
                                <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden group/avatar shadow-sm group-hover:shadow-md transition-all duration-300">
                                  {/* Background & Gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900" />

                                  {/* Inner Shine */}
                                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-gray-300/5 to-gray-200/8 dark:via-gray-700/3 dark:to-gray-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                  {/* Border Ring */}
                                  <div className="absolute inset-0 border border-gray-200/60 dark:border-gray-700/60 rounded-2xl" />

                                  {/* Content */}
                                  <div className="relative h-full w-full flex items-center justify-center">
                                    {/* Default state */}
                                    <span className="font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-400 select-none group-hover:opacity-0 transition-opacity duration-300">
                                      {classRoom.name.charAt(0).toUpperCase()}
                                    </span>
                                    {/* Hover state */}
                                    <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary-600 to-primary-500 dark:from-primary-400 dark:to-primary-500 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                      {classRoom.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                    {classRoom.name}
                                  </h3>
                                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                    {classRoom.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400 relative dropdown-container">
                                <span className="inline-flex items-center gap-1.5">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  {formatDate(classRoom.createdAt)}
                                </span>
                                <span className="text-gray-300 dark:text-gray-600">
                                  •
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                  {quizCount} bài kiểm tra

                                  {/* Quick Access Button */}
                                  {quizCount > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDropdownToggle(classRoom.id);
                                      }}
                                      className={`
                                    ml-1 w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 
                                    transition-colors duration-200 focus:outline-none ring-0 outline-none
                                    ${openDropdown === classRoom.id ? 'bg-gray-100 dark:bg-gray-700 text-primary-600 dark:text-primary-400' : 'text-gray-400'}
                                  `}
                                      title="Xem nhanh dánh sách bài kiểm tra"
                                    >
                                      <svg
                                        className={`w-4 h-4 transition-transform duration-200 ${openDropdown === classRoom.id ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  )}
                                </span>

                                {/* Dropdown Menu */}
                                {validQuizzes.length > 0 && (
                                  <div
                                    className={`
                                  absolute top-full left-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden 
                                  transition-all duration-200 ease-out origin-top-left
                                  ${openDropdown === classRoom.id
                                        ? 'opacity-100 scale-100 translate-y-0 visible pointer-events-auto'
                                        : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
                                `}
                                  >
                                    <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                      <p className="text-sm font-semibold text-white">
                                        Chọn bài kiểm tra
                                      </p>
                                    </div>
                                    <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                                      {validQuizzes.map((quiz, idx) => (
                                        <button
                                          key={quiz.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/quiz/${quiz.id}`);
                                            setOpenDropdown(null);
                                          }}
                                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                                        >
                                          <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                              {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                                                {quiz.title}
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {(quiz as any).questionCount ??
                                                  (quiz as any).questions?.length ??
                                                  0}{" "}
                                                câu hỏi
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Desktop buttons - bên phải */}
                            <div className="flex items-center gap-2">
                              {/* Unified 'Tham gia' button for Desktop that toggles expansion */}
                              <button
                                className="btn-primary flex items-center gap-2"
                                onClick={() => toggleClassExpansion(classRoom.id)}
                              >
                                <svg
                                  className="w-4 h-4 mr-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                  />
                                </svg>
                                Tham gia
                                <svg
                                  className={`w-4 h-4 ml-1 transition-transform duration-200 ${expandedClasses[classRoom.id]
                                    ? "rotate-180"
                                    : ""
                                    }`}
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

                              {/* OLD COMPLEX LOGIC FOR THAM GIA BUTTON
                        {(() => {
                          if (quizCount > 3) {
                            // Nếu có hơn 3 quiz, hiện dropdown để xem tất cả
                            return (
                              <div className="relative dropdown-container">
                                <button
                                  className="btn-primary flex items-center"
                                  onClick={() =>
                                    handleDropdownToggle(classRoom.id)
                                  }
                                >
                                  <svg
                                    className="w-4 h-4 mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                  Tham gia
                                  <svg
                                    className={`w-4 h-4 ml-1 transition-transform duration-200 ${openDropdown === classRoom.id
                                      ? "rotate-180"
                                      : ""
                                      }`}
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
                                {openDropdown === classRoom.id && (
                                  <div className="absolute top-full left-0 mt-2 w-64 sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                                    <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                      <p className="text-sm font-semibold text-white">
                                        Chọn bài kiểm tra
                                      </p>
                                    </div>
                                    <div className="p-2 max-h-80 overflow-y-auto">
                                      {validQuizzes.map((quiz, idx) => (
                                        <button
                                          key={quiz.id}
                                          onClick={() => {
                                            navigate(`/quiz/${quiz.id}`);
                                            setOpenDropdown(null);
                                          }}
                                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group"
                                        >
                                          <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                              {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                {quiz.title}
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {(quiz as any).questionCount ??
                                                  (quiz as any).questions
                                                    ?.length ??
                                                  0}{" "}
                                                câu hỏi
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          } else if (quizCount >= 1) {
                            // Có từ 1-3 quiz
                            if (quizCount === 1) {
                              return (
                                <button
                                  className="btn-primary flex items-center"
                                  onClick={() => {
                                    const firstQuiz = validQuizzes[0];
                                    navigate(`/quiz/${firstQuiz.id}`);
                                  }}
                                >
                                  <svg
                                    className="w-4 h-4 mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                  Tham gia
                                </button>
                              );
                            } else {
                              return (
                                <div className="relative dropdown-container">
                                  <button
                                    className="btn-primary flex items-center"
                                    onClick={() =>
                                      handleDropdownToggle(classRoom.id)
                                    }
                                  >
                                    <svg
                                      className="w-4 h-4 mr-1"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                      />
                                    </svg>
                                    Tham gia
                                    <svg
                                      className={`w-4 h-4 ml-1 transition-transform duration-200 ${openDropdown === classRoom.id
                                        ? "rotate-180"
                                        : ""
                                        }`}
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
                                  {openDropdown === classRoom.id && (
                                    <div className="absolute top-full left-0 mt-2 w-64 sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                                      <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                        <p className="text-sm font-semibold text-white">
                                          Chọn bài kiểm tra
                                        </p>
                                      </div>
                                      <div className="p-2 max-h-80 overflow-y-auto">
                                        {validQuizzes.map((quiz, idx) => (
                                          <button
                                            key={quiz.id}
                                            onClick={() => {
                                              navigate(`/quiz/${quiz.id}`);
                                              setOpenDropdown(null);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group"
                                          >
                                            <div className="flex items-start gap-3">
                                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                                {idx + 1}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                  {quiz.title}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                  {(quiz as any)
                                                    .questionCount ??
                                                    (quiz as any).questions
                                                      ?.length ??
                                                    0}{" "}
                                                  câu hỏi
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          } else {
                            // Không có quiz nào
                            return (
                              <button className="btn-primary" disabled>
                                Chưa có bài kiểm tra
                              </button>
                            );
                          }
                        })()} */}

                              <button
                                onClick={() =>
                                  handleToggleClassShare(
                                    classRoom.id,
                                    shareStatus[`class_${classRoom.id}`] || false
                                  )
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`btn-secondary ${shareStatus[`class_${classRoom.id}`]
                                  ? "!bg-purple-500 !text-white hover:!bg-purple-600 dark:!bg-purple-600 dark:hover:!bg-purple-700"
                                  : "!bg-purple-100 !text-purple-700 hover:!bg-purple-200 dark:!bg-purple-900/20 dark:!text-purple-300 dark:hover:!bg-purple-900/40"
                                  } ${(classRoom as any).accessType === "shared"
                                    ? "opacity-50 !cursor-not-allowed"
                                    : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : `Trạng thái: ${shareStatus[`class_${classRoom.id}`]
                                    ? "Có thể chia sẻ"
                                    : "Không thể chia sẻ"
                                  }\n\nNhấn để ${shareStatus[`class_${classRoom.id}`] ? "tắt" : "bật"
                                  } chia sẻ lớp học`}
                              >
                                {/* Share Toggle Icon */}
                                {shareStatus[`class_${classRoom.id}`] ? (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                    />
                                  </svg>
                                )}
                              </button>

                              <button
                                onClick={() => handleShareClass(classRoom.id)}
                                disabled={
                                  (classRoom as any).accessType === "shared" ||
                                  !shareStatus[`class_${classRoom.id}`]
                                }
                                className={`btn-secondary !bg-indigo-100 !text-indigo-700 hover:!bg-indigo-200 dark:!bg-indigo-900/20 dark:!text-indigo-300 dark:hover:!bg-indigo-900/40 ${(classRoom as any).accessType === "shared" ||
                                  !shareStatus[`class_${classRoom.id}`]
                                  ? "opacity-50 !cursor-not-allowed"
                                  : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : shareStatus[`class_${classRoom.id}`]
                                    ? "Sao chép ID/Link chia sẻ"
                                    : "Bật chia sẻ trước để lấy ID/Link"
                                }
                              >
                                {/* Copy Link Icon */}
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              </button>

                              <button
                                onClick={() =>
                                  handleToggleClassPublic(
                                    classRoom.id,
                                    Boolean(classRoom.isPublic)
                                  )
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`btn-secondary ${classRoom.isPublic
                                  ? "!bg-green-500 !text-white hover:!bg-green-600 dark:!bg-green-600 dark:hover:!bg-green-700"
                                  : "!bg-green-100 !text-green-700 hover:!bg-green-200 dark:!bg-green-900/20 dark:!text-green-300 dark:hover:!bg-green-900/40"
                                  } ${(classRoom as any).accessType === "shared"
                                    ? "opacity-50 !cursor-not-allowed"
                                    : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : `Trạng thái: ${classRoom.isPublic ? "Công khai" : "Riêng tư"
                                  }\n\nNhấn để ${classRoom.isPublic ? "đặt riêng tư" : "công khai"
                                  } lớp học và tất cả quiz`}
                              >
                                {/* Public vs Private Icon */}
                                {classRoom.isPublic ? (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 11c1.657 0 3-1.343 3-3V6a3 3 0 10-6 0v2c0 1.657 1.343 3 3 3z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 11h14v10H5z"
                                    />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  navigate(`/edit-class/${classRoom.id}`, {
                                    state: { classRoom },
                                  })
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`btn-secondary !bg-blue-100 !text-blue-700 hover:!bg-blue-200 dark:!bg-yellow-900/20 dark:!text-yellow-400 dark:hover:!bg-yellow-900/40 ${(classRoom as any).accessType === "shared"
                                  ? "opacity-50 !cursor-not-allowed"
                                  : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared" ? "Không có quyền sử dụng" : "Chỉnh sửa lớp học"}
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17.25V21h3.75l11.06-11.06a2.121 2.121 0 10-3-3L3 17.25z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteClass(classRoom.id, classRoom.name)
                                }
                                className="btn-secondary !bg-red-100 !text-red-700 hover:!bg-red-200 dark:!bg-red-900/20 dark:!text-red-400 dark:hover:!bg-red-900/40"
                                title="Xóa lớp học"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Mobile Layout - flex dọc, nút xóa cùng hàng với Vào lớp */}
                          <div className="sm:hidden mb-4">
                            <div className="pr-8">
                              <div className="flex items-start gap-3 mb-3">
                                {/* Avatar với chữ cái đầu tiên (New Luxury Style) */}
                                <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden group/avatar shadow-sm group-hover:shadow-md transition-all duration-300">
                                  {/* Background & Gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900" />

                                  {/* Inner Shine */}
                                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-gray-300/5 to-gray-200/8 dark:via-gray-700/3 dark:to-gray-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                  {/* Border Ring */}
                                  <div className="absolute inset-0 border border-gray-200/60 dark:border-gray-700/60 rounded-2xl" />

                                  {/* Content */}
                                  <div className="relative h-full w-full flex items-center justify-center">
                                    {/* Default state */}
                                    <span className="font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-400 select-none group-hover:opacity-0 transition-opacity duration-300">
                                      {classRoom.name.charAt(0).toUpperCase()}
                                    </span>
                                    {/* Hover state */}
                                    <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-primary-600 to-primary-500 dark:from-primary-400 dark:to-primary-500 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                      {classRoom.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                    {classRoom.name}
                                  </h3>
                                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                    {classRoom.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-4 relative dropdown-container">
                                <span className="inline-flex items-center gap-1.5">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  {formatDate(classRoom.createdAt)}
                                </span>
                                <span className="text-gray-300 dark:text-gray-600">
                                  •
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                  {quizCount} bài kiểm tra

                                  {/* Quick Access Button */}
                                  {quizCount > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDropdownToggle(classRoom.id);
                                      }}
                                      className={`
                                    ml-1 w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 
                                    transition-colors duration-200 focus:outline-none ring-0 outline-none
                                    ${openDropdown === classRoom.id ? 'bg-gray-100 dark:bg-gray-700 text-primary-600 dark:text-primary-400' : 'text-gray-400'}
                                  `}
                                      title="Xem nhanh dánh sách bài kiểm tra"
                                    >
                                      <svg
                                        className={`w-4 h-4 transition-transform duration-200 ${openDropdown === classRoom.id ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  )}
                                </span>

                                {/* Dropdown Menu */}
                                {validQuizzes.length > 0 && (
                                  <div
                                    className={`
                                  absolute top-full left-0 mt-2 w-full sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden 
                                  transition-all duration-200 ease-out origin-top-left
                                  ${openDropdown === classRoom.id
                                        ? 'opacity-100 scale-100 translate-y-0 visible pointer-events-auto'
                                        : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'}
                                `}
                                  >
                                    <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                      <p className="text-sm font-semibold text-white">
                                        Chọn bài kiểm tra
                                      </p>
                                    </div>
                                    <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar">
                                      {validQuizzes.map((quiz, idx) => (
                                        <button
                                          key={quiz.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/quiz/${quiz.id}`);
                                            setOpenDropdown(null);
                                          }}
                                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                                        >
                                          <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                              {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                                                {quiz.title}
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {(quiz as any).questionCount ??
                                                  (quiz as any).questions?.length ??
                                                  0}{" "}
                                                câu hỏi
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Mobile buttons - Vào lớp và Xóa lớp cùng hàng */}
                            <div className="flex flex-row gap-2 mt-2">
                              {/* Mobile 'Tham gia' button */}
                              <button
                                className="btn-primary flex items-center justify-center flex-1"
                                onClick={() => toggleClassExpansion(classRoom.id)}
                              >
                                <svg
                                  className="w-4 h-4 mr-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                  />
                                </svg>
                                Tham gia
                                <svg
                                  className={`w-4 h-4 ml-1 transition-transform duration-200 ${expandedClasses[classRoom.id]
                                    ? "rotate-180"
                                    : ""
                                    }`}
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
                              {/* {(() => {
                          if (quizCount > 3) {
                            return (
                              <div className="relative dropdown-container flex-1">
                                <button
                                  className="btn-primary flex items-center justify-center w-full"
                                  onClick={() =>
                                    handleDropdownToggle(classRoom.id)
                                  }
                                >
                                  <svg
                                    className="w-4 h-4 mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                  Tham gia
                                  <svg
                                    className={`w-4 h-4 ml-1 transition-transform duration-200 ${openDropdown === classRoom.id
                                      ? "rotate-180"
                                      : ""
                                      }`}
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
                                {openDropdown === classRoom.id && (
                                  <div className="absolute top-full left-0 mt-2 w-full sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                                    <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                      <p className="text-sm font-semibold text-white">
                                        Chọn bài kiểm tra
                                      </p>
                                    </div>
                                    <div className="p-2 max-h-80 overflow-y-auto global-scrollbar">
                                      {validQuizzes.map((quiz, idx) => (
                                        <button
                                          key={quiz.id}
                                          onClick={() => {
                                            navigate(`/quiz/${quiz.id}`);
                                            setOpenDropdown(null);
                                          }}
                                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group"
                                        >
                                          <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                              {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                {quiz.title}
                                              </div>
                                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {(quiz as any).questionCount ??
                                                  (quiz as any).questions
                                                    ?.length ??
                                                  0}{" "}
                                                câu hỏi
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          } else if (quizCount >= 1) {
                            if (quizCount === 1) {
                              return (
                                <button
                                  className="btn-primary flex-1 flex items-center justify-center"
                                  onClick={() => {
                                    const firstQuiz = validQuizzes[0];
                                    navigate(`/quiz/${firstQuiz.id}`);
                                  }}
                                >
                                  <svg
                                    className="w-4 h-4 mr-1"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                  Tham gia
                                </button>
                              );
                            } else {
                              // 2-3 quiz
                              return (
                                <div className="relative dropdown-container flex-1">
                                  <button
                                    className="btn-primary flex items-center justify-center w-full"
                                    onClick={() =>
                                      handleDropdownToggle(classRoom.id)
                                    }
                                  >
                                    <svg
                                      className="w-4 h-4 mr-1"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                      />
                                    </svg>
                                    Tham gia
                                    <svg
                                      className={`w-4 h-4 ml-1 transition-transform duration-200 ${openDropdown === classRoom.id
                                        ? "rotate-180"
                                        : ""
                                        }`}
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
                                  {openDropdown === classRoom.id && (
                                    <div className="absolute top-full left-0 mt-2 w-full sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                                      <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                        <p className="text-sm font-semibold text-white">
                                          Chọn bài kiểm tra
                                        </p>
                                      </div>
                                      <div className="p-2 max-h-80 overflow-y-auto">
                                        {validQuizzes.map((quiz, idx) => (
                                          <button
                                            key={quiz.id}
                                            onClick={() => {
                                              navigate(`/quiz/${quiz.id}`);
                                              setOpenDropdown(null);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 group"
                                          >
                                            <div className="flex items-start gap-3">
                                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                                                {idx + 1}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                  {quiz.title}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                  {(quiz as any)
                                                    .questionCount ??
                                                    (quiz as any).questions
                                                      ?.length ??
                                                    0}{" "}
                                                  câu hỏi
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          } else {
                            return (
                              <button className="btn-primary flex-1" disabled>
                                Chưa có bài kiểm tra
                              </button>
                            );
                          }
                        })()} */}
                              {/* Nút toggle chia sẻ & copy link cho mobile */}
                              <button
                                onClick={() =>
                                  handleToggleClassShare(
                                    classRoom.id,
                                    shareStatus[`class_${classRoom.id}`] || false
                                  )
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`w-9 h-9 rounded ${shareStatus[`class_${classRoom.id}`]
                                  ? "bg-purple-500 hover:bg-purple-600 text-white dark:bg-purple-600 dark:hover:bg-purple-700"
                                  : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 dark:text-purple-300"
                                  } flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden ${(classRoom as any).accessType === "shared"
                                    ? "opacity-50 !cursor-not-allowed"
                                    : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : `${shareStatus[`class_${classRoom.id}`] ? "Tắt" : "Bật"
                                  } chia sẻ lớp học`}
                              >
                                {shareStatus[`class_${classRoom.id}`] ? (
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
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                ) : (
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
                                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                    />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() => handleShareClass(classRoom.id)}
                                disabled={
                                  (classRoom as any).accessType === "shared" ||
                                  !shareStatus[`class_${classRoom.id}`]
                                }
                                className={`w-9 h-9 rounded bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden ${(classRoom as any).accessType === "shared" ||
                                  !shareStatus[`class_${classRoom.id}`]
                                  ? "opacity-50 !cursor-not-allowed"
                                  : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : shareStatus[`class_${classRoom.id}`]
                                    ? "Sao chép ID/Link"
                                    : "Bật chia sẻ trước"
                                }
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
                                    d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656L17.656 10"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleToggleClassPublic(
                                    classRoom.id,
                                    Boolean(classRoom.isPublic)
                                  )
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`w-9 h-9 rounded ${classRoom.isPublic
                                  ? "bg-green-500 hover:bg-green-600 text-white dark:bg-green-600 dark:hover:bg-green-700"
                                  : "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-300"
                                  } flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden ${(classRoom as any).accessType === "shared"
                                    ? "opacity-50 !cursor-not-allowed"
                                    : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared"
                                  ? "Không có quyền sử dụng"
                                  : `${classRoom.isPublic ? "Công khai" : "Riêng tư"
                                  }`}
                              >
                                {classRoom.isPublic ? (
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
                                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                    />
                                  </svg>
                                ) : (
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
                                      d="M12 11c1.657 0 3-1.343 3-3V6a3 3 0 10-6 0v2c0 1.657 1.343 3 3 3z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 11h14v10H5z"
                                    />
                                  </svg>
                                )}
                              </button>
                              {/* Nút chỉnh sửa & xóa lớp học - mobile */}
                              <button
                                onClick={() =>
                                  navigate(`/edit-class/${classRoom.id}`, {
                                    state: { classRoom },
                                  })
                                }
                                disabled={(classRoom as any).accessType === "shared"}
                                className={`w-9 h-9 rounded bg-blue-100 hover:bg-blue-200 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40 text-blue-700 dark:text-yellow-400 flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden ${(classRoom as any).accessType === "shared"
                                  ? "opacity-50 !cursor-not-allowed"
                                  : ""
                                  }`}
                                title={(classRoom as any).accessType === "shared" ? "Không có quyền sử dụng" : "Chỉnh sửa lớp học"}
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
                                    d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17.25V21h3.75l11.06-11.06a2.121 2.121 0 10-3-3L3 17.25z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteClass(classRoom.id, classRoom.name)
                                }
                                className="w-9 h-9 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden"
                                title="Xóa lớp học"
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Centered Mobile Toggle Button - COMMENTED OUT as integrated into main 'Tham gia' button */}
                          {/* {quizCount > 0 && (
                      <div className="block sm:!hidden">
                        <div className="flex justify-center mb-4">
                          <button
                            onClick={() => toggleClassExpansion(classRoom.id)}
                            className={`w-12 h-6 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 flex items-center justify-center transition-all duration-200 ${expandedClasses[classRoom.id] ? "bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400" : ""}`}
                            title={expandedClasses[classRoom.id] ? "Thu gọn" : "Xem bài kiểm tra"}
                          >
                            <svg className={`w-4 h-4 transition-transform duration-300 ${expandedClasses[classRoom.id] ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )} */}

                          {/* Danh sách bài kiểm tra - scrollable toàn bộ */}
                          {quizCount > 0 && (
                            <div className={`grid grid-rows-[0fr] opacity-0 transition-all duration-500 ease-in-out ${expandedClasses[classRoom.id] ? "grid-rows-[1fr] opacity-100" : ""}`}>
                              {/* OLD HOVER LOGIC: sm:group-hover:grid-rows-[1fr] sm:group-hover:opacity-100 */}
                              <div className="overflow-hidden">
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <svg
                                      className="w-5 h-5 text-primary-500"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                      />
                                    </svg>
                                    Bài kiểm tra trong lớp
                                  </h4>
                                  <div
                                    className="space-y-3 max-h-[600px] md:max-h-[725px] overflow-y-auto pr-2 global-scrollbar"
                                  >
                                    {validQuizzes.map((quiz) => (
                                      <div
                                        key={quiz.id}
                                        className="group/quiz p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700"
                                      >
                                        {/* Desktop Layout cho quiz items */}
                                        <div className="hidden sm:flex items-center justify-between">
                                          <div>
                                            <p className="font-medium text-gray-900 dark:text-white group-hover/quiz:text-primary-600 dark:group-hover/quiz:text-primary-400 transition-colors">
                                              {quiz.title}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                              {quiz.description}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Link
                                              to={`/quiz/${quiz.id}`}
                                              state={{ className: classRoom.name }}
                                              className="btn-secondary text-sm hover:bg-primary-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                            >
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                                                />
                                              </svg>
                                              Làm bài
                                            </Link>
                                            <button
                                              onClick={() =>
                                                handleToggleQuizShare(
                                                  quiz.id,
                                                  shareStatus[`quiz_${quiz.id}`] || false
                                                )
                                              }
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`${shareStatus[`quiz_${quiz.id}`]
                                                ? "text-purple-600 dark:text-purple-400"
                                                : "text-purple-400 dark:text-purple-600"
                                                } hover:text-purple-700 dark:hover:text-purple-300 p-1 ${(classRoom as any).accessType === "shared"
                                                  ? "opacity-50 !cursor-not-allowed"
                                                  : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : `Trạng thái: ${shareStatus[`quiz_${quiz.id}`]
                                                  ? "Có thể chia sẻ"
                                                  : "Không thể chia sẻ"
                                                }\n\nNhấn để ${shareStatus[`quiz_${quiz.id}`]
                                                  ? "tắt"
                                                  : "bật"
                                                } chia sẻ quiz`}
                                            >
                                              {/* Share Toggle Icon */}
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                {shareStatus[`quiz_${quiz.id}`] ? (
                                                  <>
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z"
                                                    />
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                    />
                                                  </>
                                                ) : (
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                  />
                                                )}
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleShareQuiz(quiz.id)}
                                              disabled={
                                                (classRoom as any).accessType ===
                                                "shared" ||
                                                !shareStatus[`quiz_${quiz.id}`]
                                              }
                                              className={`text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200 p-1 ${(classRoom as any).accessType ===
                                                "shared" ||
                                                !shareStatus[`quiz_${quiz.id}`]
                                                ? "opacity-50 !cursor-not-allowed"
                                                : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : shareStatus[`quiz_${quiz.id}`]
                                                  ? "Sao chép ID/Link chia sẻ"
                                                  : "Bật chia sẻ trước để lấy ID/Link"
                                              }
                                            >
                                              {/* Copy Link Icon */}
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172"
                                                />
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656L17.656 10"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleToggleQuizPublished(
                                                  quiz.id,
                                                  Boolean((quiz as any).published)
                                                )
                                              }
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`${(quiz as any).published
                                                ? "bg-green-500 text-white hover:bg-green-600 rounded shadow-sm p-1.5"
                                                : "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 p-1"
                                                } ${(classRoom as any).accessType === "shared"
                                                  ? "opacity-50 !cursor-not-allowed"
                                                  : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : `Trạng thái: ${(quiz as any).published
                                                  ? "Công khai"
                                                  : "Riêng tư"
                                                }\n\nNhấn để ${(quiz as any).published
                                                  ? "đặt riêng tư"
                                                  : "công khai quiz"
                                                }`}
                                            >
                                              {/* Public vs Private Icon */}
                                              {(quiz as any).published ? (
                                                <svg
                                                  className="w-4 h-4"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                  />
                                                </svg>
                                              ) : (
                                                <svg
                                                  className="w-4 h-4"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 11c1.657 0 3-1.343 3-3V6a3 3 0 10-6 0v2c0 1.657 1.343 3 3 3z"
                                                  />
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 11h14v10H5z"
                                                  />
                                                </svg>
                                              )}
                                            </button>
                                            <button
                                              onClick={async () => {
                                                try {
                                                  const { getToken } = await import(
                                                    "../utils/auth"
                                                  );
                                                  const token = getToken();
                                                  if (!token) {
                                                    alert("Vui lòng đăng nhập");
                                                    return;
                                                  }
                                                  const { QuizzesAPI } = await import(
                                                    "../utils/api"
                                                  );
                                                  const full = await QuizzesAPI.getById(
                                                    quiz.id,
                                                    token
                                                  );
                                                  navigate("/edit-quiz", {
                                                    state: {
                                                      questions: full.questions,
                                                      fileName: full.title,
                                                      fileId: full.id,
                                                      quizTitle: full.title,
                                                      quizDescription: full.description,
                                                      isEdit: true,
                                                      classInfo: {
                                                        isNew: false,
                                                        name: classRoom.name,
                                                        description: classRoom.description,
                                                        classId: classRoom.id,
                                                      },
                                                    },
                                                  });
                                                } catch (e) {
                                                  alert(
                                                    "Không thể tải nội dung quiz để chỉnh sửa."
                                                  );
                                                }
                                              }}
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`text-blue-600 hover:text-blue-700 dark:text-yellow-400 dark:hover:text-yellow-300 p-1 ${(classRoom as any).accessType === "shared"
                                                ? "opacity-50 !cursor-not-allowed"
                                                : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared" ? "Không có quyền sử dụng" : "Chỉnh sửa bài kiểm tra"}
                                            >
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17.25V21h3.75l11.06-11.06a2.121 2.121 0 10-3-3L3 17.25z"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleDeleteQuiz(
                                                  classRoom.id,
                                                  quiz.id,
                                                  quiz.title
                                                )
                                              }
                                              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
                                              title="Xóa bài kiểm tra"
                                            >
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>

                                        {/* Mobile Layout cho quiz items - nút Làm bài và xóa cùng hàng */}
                                        <div className="sm:hidden">
                                          <p className="font-medium text-gray-900 dark:text-white mb-1 group-hover/quiz:text-primary-600 dark:group-hover/quiz:text-primary-400 transition-colors">
                                            {quiz.title}
                                          </p>
                                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                            {quiz.description}
                                          </p>
                                          <div className="flex flex-row gap-2">
                                            <Link
                                              to={`/quiz/${quiz.id}`}
                                              state={{ className: classRoom.name }}
                                              className="btn-secondary text-sm text-center w-full hover:bg-primary-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                            >
                                              <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                                                />
                                              </svg>
                                              Làm bài
                                            </Link>
                                            <button
                                              onClick={() =>
                                                handleToggleQuizShare(
                                                  quiz.id,
                                                  shareStatus[`quiz_${quiz.id}`] || false
                                                )
                                              }
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`w-9 h-9 rounded ${shareStatus[`quiz_${quiz.id}`]
                                                ? "bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700"
                                                : "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40"
                                                } flex items-center justify-center transition-all duration-200 hover:scale-110 ${(classRoom as any).accessType === "shared"
                                                  ? "opacity-50 !cursor-not-allowed"
                                                  : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : `${shareStatus[`quiz_${quiz.id}`]
                                                  ? "Đang chia sẻ"
                                                  : "Chưa chia sẻ"
                                                }`}
                                            >
                                              <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                {shareStatus[`quiz_${quiz.id}`] ? (
                                                  <>
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z"
                                                    />
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                    />
                                                  </>
                                                ) : (
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                  />
                                                )}
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleShareQuiz(quiz.id)}
                                              disabled={
                                                (classRoom as any).accessType ===
                                                "shared" ||
                                                !shareStatus[`quiz_${quiz.id}`]
                                              }
                                              className={`w-9 h-9 rounded bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center transition-all duration-200 hover:scale-110 ${(classRoom as any).accessType ===
                                                "shared" ||
                                                !shareStatus[`quiz_${quiz.id}`]
                                                ? "opacity-50 !cursor-not-allowed"
                                                : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : shareStatus[`quiz_${quiz.id}`]
                                                  ? "Sao chép ID/Link"
                                                  : "Bật chia sẻ trước"
                                              }
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
                                                  d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172"
                                                />
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656L17.656 10"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleToggleQuizPublished(
                                                  quiz.id,
                                                  Boolean((quiz as any).published)
                                                )
                                              }
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`w-9 h-9 rounded ${(quiz as any).published
                                                ? "bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
                                                : "bg-green-100 hover:bg-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-300"
                                                } flex items-center justify-center transition-all duration-200 hover:scale-110 ${(classRoom as any).accessType === "shared"
                                                  ? "opacity-50 !cursor-not-allowed"
                                                  : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared"
                                                ? "Không có quyền sử dụng"
                                                : `${(quiz as any).published
                                                  ? "Công khai"
                                                  : "Riêng tư"
                                                }`}
                                            >
                                              {(quiz as any).published ? (
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
                                                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                  />
                                                </svg>
                                              ) : (
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
                                                    d="M12 11c1.657 0 3-1.343 3-3V6a3 3 0 10-6 0v2c0 1.657 1.343 3 3 3z"
                                                  />
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 11h14v10H5z"
                                                  />
                                                </svg>
                                              )}
                                            </button>
                                            <button
                                              onClick={async () => {
                                                try {
                                                  const { getToken } = await import(
                                                    "../utils/auth"
                                                  );
                                                  const token = getToken();
                                                  if (!token) {
                                                    alert("Vui lòng đăng nhập");
                                                    return;
                                                  }
                                                  const { QuizzesAPI } = await import(
                                                    "../utils/api"
                                                  );
                                                  const full = await QuizzesAPI.getById(
                                                    quiz.id,
                                                    token
                                                  );
                                                  navigate("/edit-quiz", {
                                                    state: {
                                                      questions: full.questions,
                                                      fileName: full.title,
                                                      fileId: full.id,
                                                      quizTitle: full.title,
                                                      quizDescription: full.description,
                                                      isEdit: true,
                                                      classInfo: {
                                                        isNew: false,
                                                        name: classRoom.name,
                                                        description: classRoom.description,
                                                        classId: classRoom.id,
                                                      },
                                                    },
                                                  });
                                                } catch (e) {
                                                  alert(
                                                    "Không thể tải nội dung quiz để chỉnh sửa."
                                                  );
                                                }
                                              }}
                                              disabled={
                                                (classRoom as any).accessType === "shared"
                                              }
                                              className={`w-9 h-9 rounded bg-blue-100 hover:bg-blue-200 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40 text-blue-700 dark:text-yellow-400 flex items-center justify-center transition-all duration-200 hover:scale-110 sm:hidden ${(classRoom as any).accessType === "shared"
                                                ? "opacity-50 !cursor-not-allowed"
                                                : ""
                                                }`}
                                              title={(classRoom as any).accessType === "shared" ? "Không có quyền sử dụng" : "Chỉnh sửa bài kiểm tra"}
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
                                                  d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17.25V21h3.75l11.06-11.06a2.121 2.121 0 10-3-3L3 17.25z"
                                                />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleDeleteQuiz(
                                                  classRoom.id,
                                                  quiz.id,
                                                  quiz.title
                                                )
                                              }
                                              className="w-9 h-9 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center transition-all duration-200 hover:scale-110"
                                              title="Xóa bài kiểm tra"
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
                                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                // Empty state
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Chưa có lớp học nào
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Hãy tạo lớp học mới hoặc nhập ID/Link chia sẻ để bắt đầu
                  </p>
                  <Link to="/create" className="btn-primary">
                    Tạo lớp học mới
                  </Link>
                </div>
              )}
            </div>

            {/* Right Section - Desktop Only (Statistics + Guidance) */}
            <div className="hidden lg:block lg:w-[30%] lg:flex-shrink-0 order-2">
              <div className="lg:sticky lg:top-4 space-y-6">

                {/* Desktop Search Bar */}
                <div className="animate-slideLeftIn anim-delay-100">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Tìm kiếm lớp học, bài kiểm tra..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 rounded-lg focus:border-primary-500 focus:ring-0 outline-none transition-all shadow-sm hover:shadow-md"
                    />
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats Card */}
                <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 animate-slideLeftIn anim-delay-200">
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                      <svg
                        className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                      Thống kê học tập
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Tiến độ học tập của bạn
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Lớp học
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {classes.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Bài kiểm tra
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {classes.reduce(
                          (total, cls) => total + getValidQuizzes(cls).length,
                          0
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <span className="text-sm text-green-700 dark:text-green-400">
                        Đã hoàn thành
                      </span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {statsCompleted}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <span className="text-sm text-blue-700 dark:text-blue-400">
                        Điểm trung bình
                      </span>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {statsAverage}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Guidance Card */}
                <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 animate-slideLeftIn anim-delay-300">
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                      <svg
                        className="w-6 h-6 text-purple-600 dark:text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      Hướng dẫn
                    </h3>
                  </div>

                  <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
                      <div className="flex items-center justify-center w-6 h-6 shrink-0 self-center">
                        <svg
                          className="w-5 h-5 text-indigo-700 dark:text-indigo-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                          />
                        </svg>
                      </div>
                      <span>
                        <strong>CHIA SẺ</strong> hoặc <strong>ĐÓNG CHIA SẺ</strong>{" "}
                        lớp học và bài tập trắc nghiệm.
                      </span>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg">
                      <div className="flex items-center justify-center w-6 h-6 shrink-0 self-center">
                        <svg
                          className="w-5 h-5 text-purple-700 dark:text-purple-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656L17.656 10"
                          />
                        </svg>
                      </div>
                      <span>
                        Tạo <strong>ID</strong> và <strong>LINK</strong> truy cập
                        lớp học và bài tập trắc nghiệm cho người khác tham gia.
                      </span>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                      <div className="flex items-center justify-center w-6 h-6 shrink-0 self-center">
                        <svg
                          className="w-5 h-5 text-green-700 dark:text-green-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 11c1.657 0 3-1.343 3-3V6a3 3 0 10-6 0v2c0 1.657 1.343 3 3 3z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 11h14v10H5z"
                          />
                        </svg>
                      </div>
                      <span>
                        Đặt trạng thái <strong>CÔNG KHAI</strong> hoặc{" "}
                        <strong>RIÊNG TƯ</strong> cho lớp học và bài tập trắc
                        nghiệm.
                      </span>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-yellow-900/10 rounded-lg">
                      <div className="flex items-center justify-center w-6 h-6 shrink-0 self-center">
                        <svg
                          className="w-5 h-5 text-blue-700 dark:text-yellow-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15.232 5.232l3.536 3.536M9 11l6 6M3 17.25V21h3.75l11.06-11.06a2.121 2.121 0 10-3-3L3 17.25z"
                          />
                        </svg>
                      </div>
                      <span>
                        <strong>CHỈNH SỬA</strong> thông tin và nội dung lớp học và
                        bài tập trắc nghiệm.
                      </span>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
                      <div className="flex items-center justify-center w-6 h-6 shrink-0 self-center">
                        <svg
                          className="w-5 h-5 text-red-700 dark:text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </div>
                      <span>
                        <strong>XÓA</strong> lớp học và bài tập trắc nghiệm.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Share Modal */}
          {
            shareOpen && shareData && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-slate-700 animate-slideUp">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 flex items-center justify-center shadow-lg">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        Chia sẻ {shareData.type === "class" ? "lớp học" : "quiz"}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Gửi ID hoặc Link để mời người khác
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* ID Field */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        ID chia sẻ {shareData.type === "class" ? "lớp học" : "bài kiểm tra"}
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            readOnly
                            value={shareData.code || buildShortId(shareData.id)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-900 dark:text-white font-mono text-center font-bold tracking-widest focus:border-purple-500 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-500/20 transition-all outline-none cursor-text select-all"
                            onClick={(e) => e.currentTarget.select()}
                          />
                        </div>
                        <button
                          onClick={() => copyToClipboard(shareData.code || buildShortId(shareData.id))}
                          className="px-4 py-3 rounded-xl font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 border-2 border-purple-200 dark:border-purple-500/30 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                          title="Sao chép ID"
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
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                          <span className="hidden sm:inline">Copy</span>
                        </button>
                      </div>
                    </div>

                    {/* Link Field */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Link chia sẻ
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            readOnly
                            value={buildShareLink(shareData.type, shareData.id, shareData.code)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300 text-sm focus:border-purple-500 dark:focus:border-purple-400 focus:ring-4 focus:ring-purple-500/20 transition-all outline-none cursor-text select-all truncate"
                            onClick={(e) => e.currentTarget.select()}
                          />
                        </div>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              buildShareLink(shareData.type, shareData.id, shareData.code)
                            )
                          }
                          className="px-4 py-3 rounded-xl font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 border-2 border-purple-200 dark:border-purple-500/30 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                          title="Sao chép Link"
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
                              d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 115.656 5.656L17.656 10"
                            />
                          </svg>
                          <span className="hidden sm:inline">Copy</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-8">
                    <button
                      className="w-full px-4 py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 border-2 border-transparent transition-all active:scale-[0.98]"
                      onClick={() => {
                        setShareOpen(false);
                        setShareData(null);
                      }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {/* Import Modal */}
          {
            importOpen && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-slate-700 animate-slideUp">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      Nhập ID/Link
                    </h3>
                  </div>

                  <div className="space-y-5">
                    {/* Type Selector */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Kiểu truy cập
                      </label>
                      <div className="relative import-type-dropdown">
                        <button
                          type="button"
                          onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
                          className={`w-full px-4 py-3 flex items-center justify-between rounded-xl border-2 transition-all duration-200 bg-white dark:bg-slate-700 text-gray-900 dark:text-white ${isImportDropdownOpen
                            ? "border-blue-500 ring-2 ring-blue-500/20"
                            : "border-gray-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400"
                            }`}
                        >
                          <span className="font-medium flex-1 text-left">
                            {importType === "auto" && "Tự động"}
                            {importType === "class" && "Lớp học"}
                            {importType === "quiz" && "Quiz"}
                          </span>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isImportDropdownOpen ? "rotate-180" : ""
                              }`}
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

                        {isImportDropdownOpen && (
                          <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fadeIn">
                            <div className="p-1 space-y-1">
                              {[
                                { value: "auto", label: "Tự động", desc: "Tự động nhận diện ID/link lớp hoặc quiz" },
                                { value: "class", label: "Lớp học", desc: "Nhập ID hoặc link lớp học" },
                                { value: "quiz", label: "Quiz", desc: "Nhập ID hoặc link bài quiz" }
                              ].map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setImportType(option.value as any);
                                    setIsImportDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-between group ${importType === option.value
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                    : "hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                                    }`}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium">{option.label}</div>
                                    <div className={`text-xs mt-0.5 ${importType === option.value
                                      ? "text-blue-500 dark:text-blue-400"
                                      : "text-gray-500 dark:text-gray-500"
                                      }`}>
                                      {option.desc}
                                    </div>
                                  </div>
                                  {importType === option.value && (
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Input Field */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        ID hoặc Link
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={importInput}
                            onChange={(e) => setImportInput(e.target.value)}
                            placeholder="abc123 hoặc https://..."
                            autoComplete="off"
                            className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 font-mono text-sm focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 transition-all outline-none"
                            style={{
                              WebkitAppearance: 'none',
                              appearance: 'none',
                              minHeight: '48px'
                            }}
                          />
                          {importInput && (
                            <button
                              onClick={() => setImportInput('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              type="button"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              setImportInput(text.trim());
                            } catch (err) {
                              // Fallback: prompt user to paste manually
                              alert('⚠️ Không thể đọc clipboard.\n\nVui lòng dán thủ công (Ctrl+V / Cmd+V) vào ô nhập.');
                            }
                          }}
                          className="px-4 py-3 rounded-xl font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border-2 border-blue-200 dark:border-blue-500/30 transition-all flex items-center gap-2 whitespace-nowrap"
                          type="button"
                          title="Dán từ clipboard"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span className="hidden sm:inline">Dán</span>
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        📌 Bấm nút <span className="font-semibold text-blue-600 dark:text-blue-400">Dán</span> hoặc nhập/dán (Ctrl+V) thủ công
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 mt-6">
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 border-2 border-transparent transition-all"
                      onClick={() => {
                        setImportOpen(false);
                        setImportInput("");
                        setImportType("auto");
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      onClick={handleImport}
                      disabled={!importInput.trim()}
                    >
                      Nhập
                    </button>
                  </div>
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
};

export default ClassesPage;
