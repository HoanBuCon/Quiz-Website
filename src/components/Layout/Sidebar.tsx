import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useData } from "../../context/DataContext";
import { useMusic } from "../../context/MusicContext";
import {
    FaMusic,
    FaSignOutAlt,
    FaUser,
    FaHome,
    FaBook,
    FaPlus,
    FaGraduationCap,
    FaCommentDots
} from "react-icons/fa";
import { getToken, clearToken } from "../../utils/auth";
import { toast } from "react-hot-toast";

const Sidebar: React.FC = () => {
    const { isDarkMode, toggleTheme } = useTheme();
    const { showMusicPlayer, toggleMusicPlayer, isPlaying } = useMusic();
    const location = useLocation();
    const navigate = useNavigate();
    const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
    const [userName, setUserName] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);

    // Listen for chat unread count
    useEffect(() => {
        const handleUnreadUpdate = (e: any) => {
            setUnreadCount(e.detail?.count || 0);
        };

        // Initial load
        const stored = localStorage.getItem('chat_unread_count');
        if (stored) setUnreadCount(parseInt(stored, 10));

        window.addEventListener('chat:unread', handleUnreadUpdate);
        return () => window.removeEventListener('chat:unread', handleUnreadUpdate);
    }, []);

    const toggleChat = () => {
        window.dispatchEvent(new Event('chat:toggle'));
    };

    const { clearData } = useData();

    // Shimmer effect handlers (Keep existing)
    const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
        const shimmer = e.currentTarget.querySelector(".nav-shimmer") as HTMLElement | null;
        if (!shimmer) return;
        shimmer.classList.remove("backward");
        void shimmer.offsetWidth;
        shimmer.classList.add("forward");
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
        const shimmer = e.currentTarget.querySelector(".nav-shimmer") as HTMLElement | null;
        if (!shimmer) return;
        shimmer.classList.remove("forward");
        void shimmer.offsetWidth;
        shimmer.classList.add("backward");
    };

    // Auth logic (Keep existing)
    useEffect(() => {
        const loadUserInfo = async () => {
            const token = getToken();
            if (token) {
                try {
                    const { AuthAPI } = await import("../../utils/api");
                    const response = await AuthAPI.me(token);
                    setUserName(response.user.name || response.user.email.split("@")[0]);
                } catch (error) {
                    console.error("Failed to load user info:", error);
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

    useEffect(() => {
        const checkAuth = () => setIsLoggedIn(!!getToken());
        const handleAuthChange = () => checkAuth();
        window.addEventListener("authChange", handleAuthChange);
        window.addEventListener("storage", handleAuthChange);
        return () => {
            window.removeEventListener("authChange", handleAuthChange);
            window.removeEventListener("storage", handleAuthChange);
        };
    }, []);

    const handleLogout = () => {
        clearToken();
        setIsLoggedIn(false);
        setUserName(null);
        clearData();
        try { localStorage.removeItem("quiz_progress"); } catch { }
        toast.success("Đã đăng xuất thành công!");
        window.dispatchEvent(new Event("authChange"));
        navigate("/welcome");
    };

    const navItems = [
        { path: "/", label: "Trang chủ", icon: FaHome },
        { path: "/classes", label: "Lớp học", icon: FaGraduationCap },
        { path: "/create", label: "Tạo lớp", icon: FaPlus },
        { path: "/documents", label: "Tài liệu", icon: FaBook },
    ];

    const isActive = (path: string) => {
        if (path === "/") return location.pathname === "/";
        return location.pathname.startsWith(path);
    };

    return (
        <aside
            className="group/sidebar fixed xl:static inset-y-0 left-0 z-40 bg-gradient-to-b from-blue-900 to-blue-600 dark:from-[#1a1e3a] dark:to-[#1a1e3a] dark:bg-[#1a1e3a] shadow-xl transition-all duration-300 ease-in-out flex flex-col w-20 hover:w-64"
        >
            {/* Logo Area */}
            <div className="h-24 flex items-center relative overflow-hidden">
                <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 dark:via-gray-700 to-transparent"></div>
                <Link to="/" className="flex items-center gap-3 pl-5 pr-3 w-full">
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                        <img
                            src="/Trollface.png"
                            alt="Logo"
                            className="w-10 h-10 object-contain transition-transform duration-500 ease-out group-hover/sidebar:scale-125"
                        />
                    </div>
                    {/* Logo Text */}
                    <span
                        className="opacity-0 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-2.5 transition-all duration-500 ease-out logo-text text-[25px] text-white dark:text-primary-300 whitespace-nowrap"
                    >
                        liemdai
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-2 overflow-hidden group-hover/sidebar:overflow-y-auto overflow-x-hidden">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            className={`flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl transition-all duration-500 ease-out group relative overflow-hidden border-r-4
                                ${active
                                    ? "bg-gradient-to-r from-white/85 via-blue-100/95 to-blue-50/95 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-900 dark:text-blue-400 font-medium shadow-sm border-transparent group-hover/sidebar:border-blue-600 dark:group-hover/sidebar:border-blue-400"
                                    : "text-blue-100 dark:text-gray-400 hover:bg-blue-800/40 dark:hover:bg-gray-800/50 hover:text-white dark:hover:text-gray-200 hover:shadow-inner border-transparent"
                                }
                            `}
                        >
                            <Icon className={`w-6 h-6 flex-shrink-0 text-center transition-colors duration-500 ease-out ${active ? "text-blue-700 dark:text-blue-400" : "text-blue-200 dark:text-gray-500 group-hover:text-white dark:group-hover:text-gray-300"}`} />
                            <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-500 ease-out delay-75">
                                {item.label}
                            </span>

                            {/* Shimmer Effect */}
                            <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden pointer-events-none">
                                <span
                                    className="nav-shimmer block h-full bg-gradient-to-r from-transparent via-white/50 dark:via-blue-400/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-in-out"
                                />
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="p-3 relative space-y-2">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 dark:via-gray-700 to-transparent"></div>

                {/* Controls Group */}
                <div className="grid grid-cols-1 gap-2">
                    {/* Chat Toggle */}
                    <button
                        onClick={toggleChat}
                        className="flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl transition-all duration-500 ease-out w-full group relative overflow-hidden text-blue-100 dark:text-gray-400 hover:bg-blue-800/40 dark:hover:bg-gray-800/50"
                        title="Chat"
                    >
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center relative">
                            <FaCommentDots className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-blue-900 dark:border-gray-800">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </div>
                        <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 overflow-hidden transition-opacity duration-500 ease-out delay-75">
                            Cộng đồng
                        </span>
                    </button>
                    {/* Music Toggle */}
                    <button
                        onClick={toggleMusicPlayer}
                        className={`flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl transition-all duration-500 ease-out w-full group relative overflow-hidden
                            ${showMusicPlayer
                                ? "bg-gradient-to-r from-white/85 via-blue-100/95 to-blue-50/95 dark:from-blue-900/30 dark:to-blue-900/30 dark:bg-blue-900/20 text-blue-900 dark:text-blue-400"
                                : "text-blue-100 dark:text-gray-400 hover:bg-blue-800/40 dark:hover:bg-gray-800/50"
                            }
                        `}
                        title="Music Player"
                    >
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                            <FaMusic className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} style={isPlaying ? { animationDuration: '3s' } : undefined} />
                        </div>
                        <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 overflow-hidden transition-opacity duration-500 ease-out delay-75">
                            Nhạc nền
                        </span>
                    </button>

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl transition-all duration-500 ease-out w-full group relative overflow-hidden text-blue-100 dark:text-yellow-400 hover:bg-blue-800/40 dark:hover:bg-gray-800/50"
                        title="Toggle Theme"
                    >
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                            {isDarkMode ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                </svg>
                            )}
                        </div>
                        <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 overflow-hidden transition-opacity duration-500 ease-out delay-75">
                            {isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
                        </span>
                    </button>
                </div>

                {isLoggedIn ? (
                    <div className="flex items-center gap-3 pl-[15px] pr-3 h-14 rounded-xl bg-white/10 dark:bg-gray-800/30 border border-white/10 dark:border-gray-700/50 justify-start overflow-hidden group/profile relative transition-colors duration-500 ease-out hover:bg-blue-800/40 dark:hover:bg-gray-800/50">
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center transition-transform duration-500 ease-out origin-center">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-400 flex items-center justify-center text-white font-bold text-xs shadow-sm leading-none">
                                {userName ? userName.charAt(0).toUpperCase() : <FaUser className="w-3 h-3" />}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-500 ease-out whitespace-nowrap delay-75">
                            <p className="text-sm font-medium text-white dark:text-gray-200 truncate">
                                {userName || "Tài khoản"}
                            </p>
                            <Link to="/profile" className="text-xs text-blue-200 dark:text-blue-500 hover:text-white dark:hover:text-blue-400 hover:underline block">
                                Xem hồ sơ
                            </Link>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="text-blue-200 dark:text-gray-400 hover:text-red-300 dark:hover:text-red-500 transition-colors opacity-0 group-hover/sidebar:opacity-100 flex-shrink-0 absolute right-2"
                            title="Đăng xuất"
                        >
                            <FaSignOutAlt />
                        </button>
                    </div>
                ) : (
                    <Link
                        to="/login"
                        className="flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 transition-all shadow-sm w-full overflow-hidden"
                    >
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                            <FaUser className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-500 ease-out whitespace-nowrap delay-75">
                            Đăng nhập
                        </span>
                    </Link>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
