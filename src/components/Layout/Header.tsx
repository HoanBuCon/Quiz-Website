import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useData } from "../../context/DataContext";
import { useMusic } from "../../context/MusicContext";
import {
  FaMusic,
  FaBars,
  FaTimes,
  FaSignOutAlt,
  FaUser,
  FaHome,
  FaBook,
  FaPlus,
  FaGraduationCap,
  FaCommentDots,
  FaChartBar,
} from "react-icons/fa";
import { getToken, clearToken } from "../../utils/auth";
import { toast } from "react-hot-toast";
import userAvatar from "../../assets/user_avatar.gif";

// Component Header chính của website
const Header: React.FC = () => {
  const [chatUnread, setChatUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('chat_unread_count') || '0') || 0; } catch { return 0; }
  });
  useEffect(() => {
    const readUnread = () => {
      try { setChatUnread(parseInt(localStorage.getItem('chat_unread_count') || '0') || 0); } catch { setChatUnread(0); }
    };
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === 'chat_unread_count') readUnread(); };
    const onCustom = (e: Event) => {
      try {
        const ce = e as CustomEvent;
        const count = (ce as any)?.detail?.count;
        if (typeof count === 'number') {
          setChatUnread(count);
          try { localStorage.setItem('chat_unread_count', String(count)); } catch { }
        } else {
          readUnread();
        }
      } catch {
        readUnread();
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('chat:unread', onCustom as any);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chat:unread', onCustom as any);
    };
  }, []);
  const { isDarkMode, toggleTheme } = useTheme();
  const { showMusicPlayer, toggleMusicPlayer, isPlaying } = useMusic();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
  const [userName, setUserName] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);


  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const shimmer = e.currentTarget.querySelector(
      ".nav-shimmer"
    ) as HTMLElement | null;
    if (!shimmer) return;
    shimmer.classList.remove("backward");
    void shimmer.offsetWidth;
    shimmer.classList.add("forward");
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const shimmer = e.currentTarget.querySelector(
      ".nav-shimmer"
    ) as HTMLElement | null;
    if (!shimmer) return;
    shimmer.classList.remove("forward");
    void shimmer.offsetWidth;
    shimmer.classList.add("backward");
  };

  // Load user info when logged in
  useEffect(() => {
    const loadUserInfo = async () => {
      const token = getToken();
      if (token) {
        try {
          const { AuthAPI } = await import("../../utils/api");
          const response = await AuthAPI.me(token);
          setUserName(response.user.name || response.user.email.split("@")[0]);
        } catch (error) {
          // console.error("Failed to load user info:", error);
          // Fallback to email prefix if name not available
          setUserName(null);
        }
      } else {
        setUserName(null);
      }
    };

    if (isLoggedIn) {
      loadUserInfo();
    }
  }, [isLoggedIn]);

  // Update auth state when token changes
  useEffect(() => {
    const checkAuth = () => setIsLoggedIn(!!getToken());

    const handleAuthChange = () => checkAuth();

    // Listen to custom auth change events and storage changes
    window.addEventListener("authChange", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener("authChange", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  // Hàm đăng xuất
  const { clearData } = useData();

  const handleLogout = () => {
    clearToken();
    setIsLoggedIn(false);
    setUserName(null);
    clearData(); // Clear pre-fetched data
    try { localStorage.removeItem("quiz_progress"); } catch { }
    toast.success("Đã đăng xuất thành công!");
    // Trigger Header update
    window.dispatchEvent(new Event("authChange"));
    navigate("/welcome");
  };

  // Danh sách các trang navigation
  const navItems = [
    { path: "/", label: "Trang chủ", icon: FaHome },
    { path: "/classes", label: "Lớp học", icon: FaGraduationCap },
    { path: "/create", label: "Tạo lớp", icon: FaPlus },
    { path: "/documents", label: "Tài liệu", icon: FaBook },
    { path: "/profile?tab=history", label: "Thống kê", icon: FaChartBar, isStats: true },
  ];

  // Kiểm tra xem link có active không
  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    // Special handling for Stats button - active when on profile page
    if (path === "/profile?tab=history") return location.pathname.startsWith("/profile");
    return location.pathname.startsWith(path);
  };

  // Thanh highlight trượt
  const navRef = useRef<HTMLDivElement>(null);
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isUserMenuOpen && !target.closest(".user-menu-container")) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  // Hiệu ứng highlight trượt giữa các nút nav
  useEffect(() => {
    const updateHighlight = () => {
      const navEl = navRef.current;
      if (!navEl) return;

      const activeLink = navEl.querySelector(".nav-item-active");
      if (activeLink) {
        const rect = (activeLink as HTMLElement).getBoundingClientRect();
        const parentRect = navEl.getBoundingClientRect();

        // Chỉ cập nhật nếu element thực sự hiển thị (width > 0)
        if (rect.width > 0 && parentRect.width > 0) {
          setHighlightStyle({
            transform: `translateX(${rect.left - parentRect.left}px)`,
            width: `${rect.width}px`,
            opacity: 1,
            transition: 'none' // Tắt transition khi rename/resize để tránh lag
          });
          // Bật lại transition sau khi set xong (để frame sau mới có effect) - hoặc đơn giản là để CSS lo
          // Tuy nhiên để đơn giản và mượt, ta cứ set position.
          // Để tránh animation chạy loạn khi resize, ta có thể tạm tắt transition hoặc chấp nhận nó trượt về vị trí mới.
          // Ở đây ta giữ logic đơn giản: set tọa độ.
          setHighlightStyle(prev => ({
            transform: `translateX(${rect.left - parentRect.left}px)`,
            width: `${rect.width}px`,
            opacity: 1,
          }));
        }
      } else {
        setHighlightStyle({ opacity: 0 });
      }
    };

    updateHighlight();
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [location.pathname]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 to-blue-600 dark:bg-gradient-to-r dark:from-[#1a1e3a] dark:to-[#181824] shadow-xl">
        <div className="w-full relative z-10">
          <div className="flex justify-between items-center h-16 px-4 sm:px-6 lg:px-8">
            {/* Logo */}
            <div className="flex items-center min-w-0">
              <Link
                to="/"
                className="flex items-center space-x-2 group hover:scale-105 transition-transform duration-200 ease-out"
              >
                {/* Logo với Trollface không có nền */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                  <img
                    src="/Trollface.png"
                    alt="Trollface Logo"
                    className="w-8 h-8 sm:w-10 sm:h-10 object-contain group-hover:scale-110 transition-transform duration-200 ease-out"
                  />
                </div>
                <span className="text-lg sm:text-xl logo-text text-white dark:text-primary-300">
                  liemdai
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav ref={navRef} className="hidden nav:flex flex-1 max-w-2xl mx-12 justify-between relative">
              {/* Highlight nền trượt (luôn nằm dưới các nút) */}
              <div
                className={`absolute top-0 bottom-0 rounded-lg transition-all duration-500 ease-out z-0
                  ${isDarkMode
                    ? "bg-gradient-to-r from-primary-900/50 to-primary-800/50 border-l-[3px] border-blue-500 shadow-sm shadow-primary-700/20"
                    : "bg-gradient-to-r from-white/85 via-blue-100/95 to-blue-50/95 border-l-[3px] border-blue-600 shadow-md"
                  }
                `}
                style={highlightStyle}
              ></div>

              {navItems.map((item) => {
                const IconComponent = item.icon;
                const active = isActive(item.path);

                // Special handling for Stats button
                if (item.isStats) {
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate('/profile', { state: { activeTab: 'history' } })}
                      onMouseEnter={handleMouseEnter as any}
                      onMouseLeave={handleMouseLeave as any}
                      className={`relative z-10 nav-item group px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2
                        border border-transparent outline-none ring-0 focus:outline-none focus:ring-0
                        transition-all duration-0 ${!active ? "hover:duration-700" : ""} ease-out overflow-hidden
                        ${active
                          ? `nav-item-active subpixel-antialiased ${isDarkMode
                            ? "text-primary-300"
                            : "text-blue-800"
                          }`
                          : "text-white dark:text-slate-300 hover:text-primary-200 dark:hover:text-primary-400 hover:bg-blue-800/40 dark:hover:bg-slate-800/40 border-0"
                        }`}
                    >
                      <IconComponent className="w-4 h-4 nav:hidden navicon:block transition-colors duration-300 ease-out" />
                      <span className="transition-colors duration-300 ease-out">
                        {item.label}
                      </span>

                      {/* shimmer: inner sweep with transform so it reverses on hover-out */}
                      <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden pointer-events-none">
                        <span
                          className="
                            nav-shimmer
                            block h-full bg-gradient-to-r from-transparent via-primary-400/80 to-transparent
                            opacity-0 group-hover:opacity-100
                            transition-opacity duration-200 ease-in-out
                          "
                        />
                      </div>
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className={`relative z-10 nav-item group px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2
                      border border-transparent outline-none ring-0 focus:outline-none focus:ring-0
                      transition-all duration-0 ${!active ? "hover:duration-700" : ""} ease-out overflow-hidden
                      ${active
                        ? `nav-item-active subpixel-antialiased ${isDarkMode
                          ? "text-primary-300"
                          : "text-blue-800"
                        }`
                        : "text-white dark:text-slate-300 hover:text-primary-200 dark:hover:text-primary-400 hover:bg-blue-800/40 dark:hover:bg-slate-800/40 border-0"
                      }`}
                  >
                    <IconComponent className="w-4 h-4 nav:hidden navicon:block transition-colors duration-300 ease-out" />
                    <span className="transition-colors duration-300 ease-out">
                      {item.label}
                    </span>

                    {/* shimmer: inner sweep with transform so it reverses on hover-out */}
                    <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden pointer-events-none">
                      <span
                        className="
      nav-shimmer
      block h-full bg-gradient-to-r from-transparent via-primary-400/80 to-transparent
      opacity-0 group-hover:opacity-100
      transition-opacity duration-200 ease-in-out
    "
                      />
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* Desktop Theme Toggle and Music Player Buttons */}
            <div className="hidden nav:flex items-center space-x-4">
              {/* Music Player Toggle Button */}
              <button
                onClick={toggleMusicPlayer}
                className={`group relative p-2 rounded-lg outline-none focus:outline-none transition-colors duration-300 shadow-sm hover:shadow-md aspect-square w-10 h-10 flex items-center justify-center active:scale-[0.98]
                  bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600
                  ${showMusicPlayer ? "border border-sky-300/60 dark:border-sky-400/30" : "border-0"}
                `}
                aria-label="Toggle Music Player"
                aria-pressed={showMusicPlayer}
                title={
                  showMusicPlayer ? "Ẩn Music Player" : "Hiện Music Player"
                }
                style={{ willChange: "box-shadow,border-color" }}
              >
                {React.createElement(FaMusic as React.ComponentType<any>, {
                  className: `w-5 h-5 ${isPlaying ? "animate-spin" : ""} ${showMusicPlayer
                    ? "text-sky-600 dark:text-sky-300"
                    : "text-slate-600 dark:text-slate-400"
                    }`,
                  style: isPlaying ? { animationDuration: "2s" } : undefined,
                })}
              </button>

              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600 transition-all duration-300 shadow-sm hover:shadow-md aspect-square w-10 h-10 flex items-center justify-center"
                aria-label="Toggle theme"
              >
                {isDarkMode ? (
                  // Sun icon cho light mode
                  <svg
                    className="w-5 h-5 text-yellow-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  // Moon icon cho dark mode
                  <svg
                    className="w-5 h-5 text-gray-700"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>

              {/* Auth Buttons */}
              {isLoggedIn && (
                <div
                  className="relative user-menu-container"
                >
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className={`flex items-center space-x-2 pl-1 pr-3 py-1 rounded-lg text-sm font-medium transition-all duration-300 shadow-sm hover:shadow-md h-10 max-w-[200px]
                      ${(isUserMenuOpen)
                        ? "bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-slate-100 ring-2 ring-primary-500/50"
                        : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600 text-slate-700 dark:text-slate-300"
                      }
                    `}
                  >
                    <div className="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden shadow-sm">
                      <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <span className="hidden sm:inline truncate max-w-[150px]">{userName || "Tài khoản"}</span>
                  </button>

                  {/* Dropdown Menu */}
                  {(isUserMenuOpen) && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                      <div className="py-1">
                        <Link
                          to="/profile"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                        >
                          <FaUser className="w-4 h-4 mr-3" />
                          <span>Hồ sơ cá nhân</span>
                        </Link>

                        <div className="border-t border-gray-200 dark:border-gray-700"></div>

                        <button
                          onClick={() => {
                            handleLogout();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full flex items-center px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
                        >
                          <FaSignOutAlt className="w-4 h-4 mr-3" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile menu button and controls */}
            <div className="flex nav:hidden items-center space-x-2">
              {/* Mobile Music Player Button */}
              <button
                onClick={toggleMusicPlayer}
                className={`group relative p-2 rounded-lg outline-none focus:outline-none transition-colors duration-300 shadow-sm hover:shadow-md aspect-square w-10 h-10 flex items-center justify-center active:scale-[0.98]
                  bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600
                  ${showMusicPlayer ? "border border-sky-300/60 dark:border-sky-400/30" : "border-0"}
                `}
                aria-label="Toggle Music Player"
                aria-pressed={showMusicPlayer}
                title={
                  showMusicPlayer ? "Ẩn Music Player" : "Hiện Music Player"
                }
                style={{ willChange: "box-shadow,border-color" }}
              >
                {React.createElement(FaMusic as React.ComponentType<any>, {
                  className: `w-5 h-5 ${isPlaying ? "animate-spin" : ""} ${showMusicPlayer
                    ? "text-sky-600 dark:text-sky-300"
                    : "text-slate-600 dark:text-slate-400"
                    }`,
                  style: isPlaying ? { animationDuration: "2s" } : undefined,
                })}
              </button>

              {/* Mobile Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600 transition-all duration-300 shadow-sm hover:shadow-md aspect-square w-10 h-10 flex items-center justify-center"
                aria-label="Toggle theme"
              >
                {isDarkMode ? (
                  <svg
                    className="w-5 h-5 text-yellow-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-gray-700"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>

              {/* Mobile menu toggle */}
              <button
                onClick={toggleMobileMenu}
                className="relative p-2 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600 text-slate-600 dark:text-slate-400 transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center aspect-square w-10 h-10"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen
                  ? React.createElement(FaTimes as React.ComponentType<any>, {
                    className: "w-5 h-5",
                  })
                  : React.createElement(FaBars as React.ComponentType<any>, {
                    className: "w-5 h-5",
                  })}
                {!isMobileMenuOpen && chatUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header >

      {/* Mobile Navigation Menu */}
      <div
        className={`mobile-nav nav:hidden fixed top-16 left-0 right-0 z-40 bg-white dark:bg-slate-900 shadow-lg transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-y-0" : "-translate-y-full"
          }`
        }
      >
        <div className="max-w-screen-2xl mx-auto">
          <div className="py-4 px-4 sm:px-6 lg:px-8 space-y-2">
            {navItems.map((item) => {
              const IconComponent = item.icon;

              // Special handling for Stats button
              if (item.isStats) {
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate('/profile', { state: { activeTab: 'history' } });
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 w-full text-left ${isActive(item.path)
                      ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border-l-4 border-primary-600"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                      }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all duration-200 ${isActive(item.path)
                    ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border-l-4 border-primary-600"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                    }`}
                >
                  <IconComponent className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Mobile Auth Links */}
            <div className="pt-2 mt-4 flex flex-col space-y-2 relative">
              {/* Fade separator similar to Sidebar */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>
              {/* Chat open button (mobile) */}
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("chat:open"));
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200"
              >
                <span className="flex items-center gap-3">
                  <FaCommentDots className="w-4 h-4" />
                  <span>Nhóm Chat</span>
                </span>
                {chatUnread > 0 && (
                  <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </button>

              {isLoggedIn ? (
                <div className="space-y-2">
                  <Link
                    to="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200"
                  >
                    <FaUser className="w-4 h-4" />
                    <span>Hồ sơ cá nhân</span>
                  </Link>

                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg text-base font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 flex items-center gap-3"
                  >
                    <FaSignOutAlt className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-base font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all duration-200 text-center"
                  >
                    Đăng ký
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div >

      {/* Mobile menu overlay */}
      {
        isMobileMenuOpen && (
          <div
            className="nav:hidden fixed inset-0 z-30 bg-black/20 dark:bg-black/40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )
      }
    </>
  );
};

export default Header;
