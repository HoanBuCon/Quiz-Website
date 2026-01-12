import React, { useState, useEffect, useRef } from "react";
import { ClassRoom, Quiz } from "../types";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { formatDate } from "../utils/fileUtils";
import ContributionGraph from "../components/ContributionGraph";
import publicIcon from "../assets/public_icon.gif";

// Component trang chủ
const HomePage: React.FC = () => {
  const [publicClasses, setPublicClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalQuizzes, setTotalQuizzes] = useState(0);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mousePosition1, setMousePosition1] = useState({ x: 0, y: 0 });
  const [mousePosition2, setMousePosition2] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'>('date-desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const filterRefDesktop = useRef<HTMLDivElement>(null);
  const filterRefMobile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSortMenu &&
        filterRefDesktop.current &&
        !filterRefDesktop.current.contains(event.target as Node) &&
        filterRefMobile.current &&
        !filterRefMobile.current.contains(event.target as Node)
      ) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSortMenu]);

  // Hàm xử lý di chuyển chuột cho ảnh 1 (Kho tài liệu)
  const handleMouseMove1 = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    setMousePosition1({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave1 = () => {
    setMousePosition1({ x: 0, y: 0 });
  };

  // Hàm xử lý di chuyển chuột cho ảnh 2 (HoanBuCon)
  const handleMouseMove2 = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    setMousePosition2({ x: mouseX, y: mouseY });
  };

  const handleMouseLeave2 = () => {
    setMousePosition2({ x: 0, y: 0 });
  };

  const toggleClassExpansion = (classId: string) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [classId]: !prev[classId],
    }));
  };

  // Fetch public classes data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const { getToken } = await import("../utils/auth");
        const token = getToken();

        if (!token) {
          setIsLoggedIn(false);
          setLoading(false);
          return;
        }

        setIsLoggedIn(true);
        const { ClassesAPI, QuizzesAPI } = await import("../utils/api");

        // Fetch public classes
        const publicClassesData = await ClassesAPI.listPublic(token);

        // Process public classes with quizzes
        const processedClasses: ClassRoom[] = [];
        let totalQuizzesCount = 0;

        for (const cls of publicClassesData) {
          const quizzes = await QuizzesAPI.byClass(cls.id, token);
          const publishedQuizzes = quizzes.filter((q: any) => q.published === true);

          totalQuizzesCount += publishedQuizzes.length;

          processedClasses.push({
            id: cls.id,
            name: cls.name,
            description: cls.description,
            quizzes: publishedQuizzes,
            createdAt: new Date(cls.createdAt),
            updatedAt: cls.updatedAt ? new Date(cls.updatedAt) : undefined,
          } as unknown as ClassRoom);
        }

        // Sort by createdAt descending (newest first)
        processedClasses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setPublicClasses(processedClasses);
        setTotalClasses(processedClasses.length);
        setTotalQuizzes(totalQuizzesCount);
      } catch (error) {
        console.error("Error fetching public classes:", error);
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 animate-fadeIn">
      {/* Hero Section */}
      <div className="mb-8 lg:mb-12">
        <div className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 dark:from-blue-900 dark:via-slate-900 dark:to-slate-950 p-8 sm:p-12 shadow-2xl animate-slideDownIn">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
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
          <div className="relative z-10 lg:flex lg:items-start lg:gap-6 lg:justify-between">
            <div className="text-center lg:text-left lg:max-w-xs flex-shrink-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-mono font-medium text-white mb-4 tracking-tight">
                <div className="relative inline-block logo-main-wrapper">
                  <span className="logo-text text-3xl sm:text-4xl lg:text-5xl relative z-10">
                    liemdai
                  </span>
                  <span className="logo-text text-3xl sm:text-4xl lg:text-5xl logo-glitch-layer logo-glitch-layer-1" aria-hidden="true">
                    liemdai
                  </span>
                  <span className="logo-text text-3xl sm:text-4xl lg:text-5xl logo-glitch-layer logo-glitch-layer-2" aria-hidden="true">
                    liemdai
                  </span>
                </div>
                {" "}
                <span className="text-[41%] align-baseline opacity-80">
                  Đại Liêm🐧
                </span>
              </h1>
              <div className="mt-4 space-y-3 font-mono text-base sm:text-lg text-cyan-200 cyber-scan">
                <span className="block text-blue-200 dark:text-blue-300 opacity-95">
                  Nền tảng học tập trực tuyến
                </span>

                <div className="w-fit mx-auto lg:mx-0 flex flex-col gap-3">
                  {["Cực chất 🗣️🔥", "Cực liêm 🗿", "Cực liếm 👅"].map((item, i) => (
                    <span
                      key={i}
                      className="cyber-line group flex items-center gap-4"
                      data-text={item}
                    >
                      {/* hologram bullet */}
                      <span className="cyber-dot" />

                      {/* glitch text */}
                      <span className="cyber-glitch" data-text={item}>
                        {item}
                      </span>
                    </span>
                  ))}
                </div>
              </div>


            </div>

            {/* Contribution Graph - Only show if logged in */}
            {isLoggedIn && (
              <div className="mt-8 lg:mt-0 flex-1 min-w-0 flex justify-end">
                <div className="dark:bg-slate-950/5 dark:backdrop-blur-xl rounded-2xl p-6 w-fit max-w-full overflow-hidden">
                  <h3 className="text-xs font-bold text-blue-100/80 dark:text-blue-200 uppercase tracking-wider mb-3 flex items-center gap-2">
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
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    Hoạt động làm bài
                  </h3>
                  <ContributionGraph blockSize={10} showLabel={true} isBanner={true} scrollbarClass="banner-glass-scroll" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left Section - Main Content */}
        <div className="lg:w-[70%] order-2 lg:order-1">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 flex items-center gap-3">
                <span className="bg-blue-50 dark:bg-blue-900/20 rounded-xl shadow-sm border border-blue-100 dark:border-blue-800 overflow-hidden">
                  <img src={publicIcon} alt="Public" className="w-12 h-12 object-cover" />
                </span>
                Lớp học công khai
              </h2>
              <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm font-medium pl-1">
                Tiếp thu thành tựu của các bậc vĩ nhân
              </p>
            </div>

            {/* Filter Button - Desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="relative" ref={filterRefDesktop}>
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 rounded-lg focus:ring-0 outline-none hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600 active:scale-95 transition-all shadow-sm text-gray-900 dark:text-gray-100"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h14M3 10h10M3 15h10M17 10v10m0 0l-3-3m3 3l3-3" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showSortMenu && (
                  <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] overflow-hidden">
                    {[
                      { id: 'date-desc' as const, label: 'Mới nhất', icon: '↓' },
                      { id: 'date-asc' as const, label: 'Cũ nhất', icon: '↑' },
                      { id: 'name-asc' as const, label: 'Tên (A → Z)', icon: '↑' },
                      { id: 'name-desc' as const, label: 'Tên (Z → A)', icon: '↓' }
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
                )}
              </div>

              {/* Desktop Search */}
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 py-2 w-full bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 rounded-lg text-sm focus:ring-0 outline-none transition-all shadow-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Search Input */}
            <div className="sm:hidden w-full flex gap-2">
              {/* Mobile Filter Button */}
              <div className="relative flex-none" ref={filterRefMobile}>
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="w-auto inline-flex items-center justify-center px-2.5 py-2.5 rounded-lg text-sm font-mono font-bold bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600 active:scale-95 transition-all duration-300 shadow-sm text-gray-900 dark:text-gray-100"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h14M3 10h10M3 15h10M17 10v10m0 0l-3-3m3 3l3-3" />
                  </svg>
                </button>

                {/* Dropdown Menu Mobile */}
                {showSortMenu && (
                  <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] overflow-hidden">
                    {[
                      { id: 'date-desc' as const, label: 'Mới nhất', icon: '↓' },
                      { id: 'date-asc' as const, label: 'Cũ nhất', icon: '↑' },
                      { id: 'name-asc' as const, label: 'Tên (A → Z)', icon: '↑' },
                      { id: 'name-desc' as const, label: 'Tên (Z → A)', icon: '↓' }
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
                )}
              </div>

              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-gray-800 border-2 border-white dark:border-gray-800 rounded-lg focus:ring-0 outline-none transition-all shadow-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              {(() => {
                const SpinnerLoading = require("../components/SpinnerLoading").default;
                return <div style={{ transform: 'scale(0.435)' }}><SpinnerLoading /></div>;
              })()}
            </div>
          ) : publicClasses.length === 0 ? (
            // Empty state
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
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
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {isLoggedIn
                  ? "Chưa có lớp học công khai"
                  : "Vui lòng ĐĂNG NHẬP để tham gia lớp học"}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {isLoggedIn
                  ? "Hãy quay lại sau để khám phá các lớp học mới"
                  : "Bạn cần đăng nhập để được cấp quyền truy cập vào các tính năng của website"}
              </p>
            </div>
          ) : (
            // Danh sách lớp học
            <div className="space-y-4">
              {[...publicClasses]
                .sort((a, b) => {
                  switch (sortBy) {
                    case 'name-asc':
                      return a.name.localeCompare(b.name);
                    case 'name-desc':
                      return b.name.localeCompare(a.name);
                    case 'date-desc':
                      return b.createdAt.getTime() - a.createdAt.getTime();
                    case 'date-asc':
                      return a.createdAt.getTime() - b.createdAt.getTime();
                    default:
                      return 0;
                  }
                })
                .filter(cls =>
                  !searchQuery.trim() ||
                  cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (cls.description && cls.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  (Array.isArray(cls.quizzes) && cls.quizzes.some((q: any) => q.title.toLowerCase().includes(searchQuery.toLowerCase())))
                )
                .map((classRoom, index) => (
                  <div
                    key={classRoom.id}
                    className={`
                      group relative card p-6 hover:shadow-2xl transition-all duration-300
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
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3 mb-3">
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

                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
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
                            {classRoom.quizzes?.length || 0} bài kiểm tra
                          </span>
                        </div>
                      </div>

                      <div className="relative dropdown-container flex-shrink-0">
                        <button
                          className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm w-full sm:w-auto justify-center shadow-lg hover:shadow-xl transition-all"
                          onClick={() => toggleClassExpansion(classRoom.id)}
                        // OLD LOGIC
                        // onClick={() => {
                        //   if (
                        //     classRoom.quizzes &&
                        //     classRoom.quizzes.length === 1
                        //   ) {
                        //     const firstQuiz = (classRoom.quizzes as Quiz[])[0];
                        //     navigate(`/quiz/${firstQuiz.id}`, {
                        //       state: { className: classRoom.name },
                        //     });
                        //   } else {
                        //     setOpenDropdown(
                        //       openDropdown === classRoom.id
                        //         ? null
                        //         : classRoom.id
                        //     );
                        //   }
                        // }}
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
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          Tham gia
                          {/* Chevron icon indicating expansion state */}
                          <svg
                            className={`w-4 h-4 transition-transform duration-200 ${expandedClasses[classRoom.id] ? "rotate-180" : ""
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

                          {/* OLD DROPDOWN ICON LOGIC
                          {classRoom.quizzes && classRoom.quizzes.length > 1 && (
                            <svg
                              className={`w-4 h-4 transition-transform duration-200 ${openDropdown === classRoom.id ? "rotate-180" : ""
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
                          )} */}
                        </button>

                        {/* Dropdown Menu - COMMENTED OUT AS PER NEW REQUIREMENT */}
                        {/* {openDropdown === classRoom.id &&
                          classRoom.quizzes &&
                          classRoom.quizzes.length > 1 && (
                            <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-full sm:w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[60] overflow-hidden">
                              <div className="bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-3">
                                <p className="text-sm font-semibold text-white">
                                  Chọn bài kiểm tra
                                </p>
                              </div>
                              <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar">
                                {(classRoom.quizzes as Quiz[]).map(
                                  (quiz, idx) => (
                                    <button
                                      key={quiz.id}
                                      onClick={() => {
                                        navigate(`/quiz/${quiz.id}`, {
                                          state: { className: classRoom.name },
                                        });
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
                                              (quiz as any).questions?.length ??
                                              0}{" "}
                                            câu hỏi
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          )} */}
                      </div>
                    </div>


                    {/* Centered Mobile Toggle Button - COMMENTED OUT as integrated into main 'Tham gia' button */}
                    {/* {classRoom.quizzes && classRoom.quizzes.length > 0 && (
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

                    {/* Danh sách quiz trong lớp */}
                    {classRoom.quizzes && classRoom.quizzes.length > 0 && (
                      <div className={`grid grid-rows-[0fr] opacity-0 transition-all duration-500 ease-in-out ${expandedClasses[classRoom.id] ? "grid-rows-[1fr] opacity-100" : ""}`}>
                        {/* OLD HOVER LOGIC: sm:group-hover:grid-rows-[1fr] sm:group-hover:opacity-100 */}
                        <div className="overflow-hidden">
                          <div className="border-t border-gray-100 dark:border-gray-700 pt-5 mt-5">
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
                            <div className="grid gap-3 max-h-[440px] md:max-h-[460px] overflow-y-auto custom-scrollbar pr-2">
                              {(classRoom.quizzes as Quiz[]).map((quiz) => (
                                <div
                                  key={quiz.id}
                                  className="group/quiz p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-900 dark:text-white mb-1 group-hover/quiz:text-primary-600 dark:group-hover/quiz:text-primary-400 transition-colors">
                                        {quiz.title}
                                      </p>
                                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                        {quiz.description}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        navigate(`/quiz/${quiz.id}`, {
                                          state: { className: classRoom.name },
                                        })
                                      }
                                      className="btn-secondary text-sm px-4 py-2 flex items-center justify-center gap-2 hover:bg-primary-500 hover:text-white transition-all"
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
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Right Section - Sidebar */}
        <div className="w-full lg:w-[30%] lg:flex-shrink-0 order-1 lg:order-2">
          <div className="lg:sticky lg:top-4">
            <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-0 animate-slideLeftIn anim-delay-200">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-3">
                  <svg
                    className="w-6 h-6 text-primary-600 dark:text-primary-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  Kho tài liệu học tập
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Độ khó: Liemdaidary🔥
                </p>
                <a
                  href="https://lms.liemsdai.is-best.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-mono text-primary-600 dark:text-primary-400 hover:underline break-all"
                >
                  lms.liemsdai.is-best.net
                </a>
              </div>

              <div className="flex items-center justify-center">
                <div
                  className="perspective-1000 w-full"
                  onMouseMove={handleMouseMove1}
                  onMouseLeave={handleMouseLeave1}
                >
                  <a
                    href="https://lms.liemsdai.is-best.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative group block"
                  >
                    <img
                      src={
                        isDarkMode
                          ? require("../assets/liemdai_dark.png")
                          : require("../assets/liemdai_light.png")
                      }
                      alt={isDarkMode ? "liemdai_dark" : "liemdai_light"}
                      className="w-full h-auto rounded-xl shadow-2xl transition-all duration-300 ease-out cursor-pointer hover:shadow-3xl"
                      style={{
                        maxHeight: 280,
                        transform: `perspective(1000px) rotateY(${mousePosition1.x * 0.1
                          }deg) rotateX(${-mousePosition1.y * 0.1
                          }deg) translateZ(${Math.abs(mousePosition1.x) +
                            Math.abs(mousePosition1.y) >
                            0
                            ? "20px"
                            : "0px"
                          })`,
                        border: "2px solid transparent",
                        backgroundImage: isDarkMode
                          ? "linear-gradient(45deg, #0ea5e9, #06b6d4, #10b981, #84cc16)"
                          : "linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b)",
                        backgroundSize: "400% 400%",
                        animation: "neonBorder 3s ease-in-out infinite",
                        backgroundClip: "border-box",
                        borderRadius: "12px",
                      }}
                    />
                    {/* Tooltip */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-3 text-xs rounded-lg px-4 py-2 shadow-xl transition-opacity duration-200 z-20 whitespace-nowrap font-medium ${isDarkMode
                        ? "bg-gray-800 text-white border border-gray-700"
                        : "bg-white text-gray-900 border border-gray-200"
                        }`}
                    >
                      Click để chuyển đến trang →
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* About HoanBuCon Card */}
            <div className="card p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-0 mt-6 animate-slideLeftIn anim-delay-300">
              <div className="text-center mb-3">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2" style={{ fontFamily: "'Nunito', sans-serif" }}>
                  Hoàn Bự Con
                </h3>
                <a
                  href="https://hoanbucon.id.vn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-mono text-primary-600 dark:text-primary-400 hover:underline break-all"
                >
                  hoanbucon.id.vn
                </a>
              </div>

              <div className="flex items-center justify-center">
                <div
                  className="perspective-1000 w-full"
                  onMouseMove={handleMouseMove2}
                  onMouseLeave={handleMouseLeave2}
                >
                  <a
                    href="https://hoanbucon.id.vn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative group block"
                  >
                    <img
                      src={
                        isDarkMode
                          ? require("../assets/hoanbucon_dark.png")
                          : require("../assets/hoanbucon_light.png")
                      }
                      alt={isDarkMode ? "HoanBuCon_dark" : "HoanBuCon_light"}
                      className="w-full h-auto rounded-xl shadow-2xl transition-all duration-300 ease-out cursor-pointer hover:shadow-3xl"
                      style={{
                        maxHeight: 280,
                        transform: `perspective(1000px) rotateY(${mousePosition2.x * 0.1
                          }deg) rotateX(${-mousePosition2.y * 0.1
                          }deg) translateZ(${Math.abs(mousePosition2.x) +
                            Math.abs(mousePosition2.y) >
                            0
                            ? "20px"
                            : "0px"
                          })`,
                        border: "2px solid transparent",
                        backgroundImage: isDarkMode
                          ? "linear-gradient(45deg, #a855f7, #ec4899, #f59e0b, #10b981)"
                          : "linear-gradient(45deg, #8b5cf6, #d946ef, #f97316, #06b6d4)",
                        backgroundSize: "400% 400%",
                        animation: "neonBorder 3s ease-in-out infinite",
                        backgroundClip: "border-box",
                        borderRadius: "12px",
                      }}
                    />
                    {/* Tooltip */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-3 text-xs rounded-lg px-4 py-2 shadow-xl transition-opacity duration-200 z-20 whitespace-nowrap font-medium ${isDarkMode
                        ? "bg-gray-800 text-white border border-gray-700"
                        : "bg-white text-gray-900 border border-gray-200"
                        }`}
                    >
                      Click để xem Portfolio →
                    </div>
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
