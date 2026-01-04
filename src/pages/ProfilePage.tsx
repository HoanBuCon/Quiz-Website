import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { FaUser, FaEnvelope, FaLock, FaSave, FaTimes, FaEdit, FaGraduationCap, FaClipboardList, FaTrophy, FaClock, FaChartBar, FaHistory, FaUsers, FaArrowRight, FaEye, FaChevronDown, FaCheck, FaCheckCircle } from 'react-icons/fa';
import { getApiBaseUrl, StatsAPI } from '../utils/api';
import { getToken } from '../utils/auth';
import { toast } from 'react-hot-toast';
import SpinnerLoading from '../components/SpinnerLoading';
import ContributionGraph from '../components/ContributionGraph';

interface UserProfile {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    lastLoginAt?: string;
    passwordChangedAt?: string;
}

interface UserStats {
    classesOwned: number;
    quizzesOwned: number;
    quizzesTaken: number;
    totalSessions: number;
    averageScore: number;
    recentSessions: RecentSession[];
}

interface RecentSession {
    id: string;
    quizId: string;
    quizTitle: string;
    className: string;
    score: number;
    totalQuestions: number;
    percentage: number;
    completedAt: string;
}

const ProfilePage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'management'>('overview');

    // Stats Management States
    const [myClasses, setMyClasses] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [classQuizzes, setClassQuizzes] = useState<any[]>([]);
    const [selectedQuizId, setSelectedQuizId] = useState<string>('');
    const [quizDetails, setQuizDetails] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Dropdown States
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    // Edit states
    const [editingName, setEditingName] = useState(false);
    const [editingEmail, setEditingEmail] = useState(false);
    const [editingPassword, setEditingPassword] = useState(false);

    // Form states
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Loading states for each action
    const [savingName, setSavingName] = useState(false);
    const [savingEmail, setSavingEmail] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    // Password visibility states
    const [showCurrentPass, setShowCurrentPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    const API_URL = getApiBaseUrl();

    useEffect(() => {
        loadProfileData();
        loadMyClasses(); // Preload classes data upfront
    }, []);

    const isRestoringRef = useRef(false);

    useEffect(() => {
        if (selectedClassId) {
            loadClassQuizzes(selectedClassId);
            // Only reset quiz selection if not restoring from navigation
            if (!isRestoringRef.current) {
                setSelectedQuizId('');
                setQuizDetails(null);
            }
        }
    }, [selectedClassId]);

    // Restore activeTab and management state from navigation (e.g., when navigating back from ResultsPage)
    useEffect(() => {
        // Set restoration flag if we have state to restore
        if (location.state?.selectedClassId || location.state?.selectedQuizId) {
            isRestoringRef.current = true;
        }

        if (location.state?.activeTab) {
            setActiveTab(location.state.activeTab);
        }
        // Restore management tab selections if returning from stats view
        if (location.state?.selectedClassId) {
            setSelectedClassId(location.state.selectedClassId);
        }
        if (location.state?.selectedQuizId) {
            setSelectedQuizId(location.state.selectedQuizId);
        }

        // Reset restoration flag after a brief delay to allow effects to run
        if (isRestoringRef.current) {
            setTimeout(() => {
                isRestoringRef.current = false;
            }, 100);
        }
    }, [location.state]);

    // Track last loaded quiz to prevent infinite reload
    const lastLoadedQuizRef = useRef<string>('');

    // Auto-load quiz stats when quiz is selected and changed
    useEffect(() => {
        if (selectedQuizId && activeTab === 'management' && selectedQuizId !== lastLoadedQuizRef.current) {
            lastLoadedQuizRef.current = selectedQuizId;
            handleLoadQuizStats();
        }
    }, [selectedQuizId, activeTab]);

    // Click outside to close dropdowns
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.custom-dropdown-container')) {
                setOpenDropdown(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const loadProfileData = async () => {
        try {
            setLoading(true);
            const token = getToken();
            if (!token) {
                navigate('/login');
                return;
            }

            const [profileRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/profile/stats`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (!profileRes.ok || !statsRes.ok) throw new Error('Failed to load data');

            const profileData = await profileRes.json();
            const statsData = await statsRes.json();

            setProfile(profileData);
            setStats(statsData);
            setNewName(profileData.name || '');
            setNewEmail(profileData.email);
        } catch (error) {
            toast.error('Không thể tải thông tin profile');
        } finally {
            setLoading(false);
        }
    };

    const loadMyClasses = async () => {
        try {
            const token = getToken();
            if (!token) return;
            const res = await StatsAPI.getOwnerClasses(token);
            setMyClasses(res);
        } catch (error) {
            toast.error('Lỗi tải danh sách lớp học');
        }
    };

    const loadClassQuizzes = async (classId: string) => {
        try {
            const token = getToken();
            if (!token) return;
            const res = await StatsAPI.getClassQuizzes(classId, token);
            setClassQuizzes(res);
        } catch (error) {
            toast.error('Lỗi tải danh sách quiz');
        }
    };

    const handleLoadQuizStats = async () => {
        if (!selectedQuizId) return;
        try {
            setLoadingStats(true);
            const token = getToken();
            if (!token) return;
            const res = await StatsAPI.getQuizStats(selectedQuizId, token);
            setQuizDetails(res);
        } catch (error) {
            toast.error('Lỗi tải thống kê quiz');
        } finally {
            setLoadingStats(false);
        }
    };

    const handleUpdateName = async () => {
        if (!newName.trim() || newName.trim().length < 2) {
            toast.error('Tên phải có ít nhất 2 ký tự');
            return;
        }
        try {
            setSavingName(true);
            const token = getToken();
            const res = await fetch(`${API_URL}/profile/username`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newName.trim() })
            });
            if (!res.ok) throw new Error();
            toast.success('Cập nhật tên thành công!');
            setProfile(prev => prev ? { ...prev, name: newName.trim() } : null);
            setEditingName(false);
            window.dispatchEvent(new Event('authChange'));
        } catch {
            toast.error('Không thể cập nhật tên');
        } finally {
            setSavingName(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            toast.error('Email không hợp lệ');
            return;
        }
        if (!emailPassword) {
            toast.error('Vui lòng nhập mật khẩu hiện tại');
            return;
        }
        try {
            setSavingEmail(true);
            const token = getToken();
            const res = await fetch(`${API_URL}/profile/email`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ email: newEmail, password: emailPassword })
            });
            if (!res.ok) throw new Error();
            toast.success('Cập nhật email thành công!');
            setProfile(prev => prev ? { ...prev, email: newEmail } : null);
            setEditingEmail(false);
            setEmailPassword('');
        } catch {
            toast.error('Không thể cập nhật email');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 6 || newPassword !== confirmPassword) {
            toast.error('Mật khẩu không hợp lệ');
            return;
        }
        try {
            setSavingPassword(true);
            const token = getToken();
            const res = await fetch(`${API_URL}/profile/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            if (!res.ok) throw new Error();
            toast.success('Đổi mật khẩu thành công!');
            setEditingPassword(false);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch {
            toast.error('Không thể đổi mật khẩu');
        } finally {
            setSavingPassword(false);
        }
    };

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
            <div style={{ transform: 'scale(0.435)' }}><SpinnerLoading /></div>
        </div>
    );

    if (!profile || !stats) return <div className="text-center p-10">Error loading profile</div>;

    const selectedClass = myClasses.find(c => c.id === selectedClassId);
    const selectedQuiz = classQuizzes.find(q => q.id === selectedQuizId);

    return (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-16 animate-fadeIn">
            {/* Hero Section */}
            <div className="mb-8 lg:mb-12">
                <div className="relative overflow-hidden group rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 dark:from-blue-900 dark:via-slate-900 dark:to-slate-950 p-8 shadow-2xl animate-slideDownIn">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
                    {/* Overlay pattern */}
                    <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,_#fff_1px,_transparent_0)] bg-[size:24px_24px] rounded-2xl pointer-events-none"></div>
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 opacity-30 bg-gradient-to-r from-transparent via-white/65 to-transparent blur-[3px] animate-[shimmer_3s_ease-in-out_infinite] [mask-image:linear-gradient(to_right,transparent_0%,black_20%,black_80%,transparent_100%)] mix-blend-overlay rounded-2xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
                        <div className="flex flex-col sm:flex-row items-center gap-8">
                            <div className="relative group/avatar">
                                <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-20 group-hover/avatar:opacity-40 transition-opacity duration-500"></div>
                                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-br from-blue-400 to-purple-500 dark:from-gray-500 dark:to-gray-700 shadow-2xl overflow-hidden group-hover/avatar:scale-105 transition-transform duration-500">
                                    <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-700 dark:to-gray-900 flex items-center justify-center text-gray-600 dark:text-gray-200 text-3xl font-mono font-bold shadow-inner">
                                        {profile.name ? profile.name.charAt(0).toUpperCase() : profile.email.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            <div className="text-center sm:text-left space-y-3">
                                <div>
                                    <h1 className="inline-block text-2xl sm:text-4xl font-bold mb-2 tracking-tight drop-shadow-md logo-text" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {profile.name || 'User'}
                                    </h1>
                                    <div className="flex items-center justify-center sm:justify-start gap-3 text-blue-100 font-mono text-sm">
                                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-500/20 border border-blue-400/20 backdrop-blur-sm flex items-center gap-2">
                                            <FaEnvelope className="text-xs" /> {profile.email}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                    <span className="px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-[10px] sm:text-xs text-white font-medium border border-white/10 transition-colors shadow-lg flex items-center gap-2 cursor-default">
                                        <FaClock className="text-blue-300" />
                                        Thành viên từ {new Date(profile.createdAt).toLocaleDateString('en-GB')}
                                    </span>
                                    {profile.lastLoginAt && (
                                        <span className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 backdrop-blur-md rounded-full text-[10px] sm:text-xs text-green-100 font-medium border border-green-500/20 transition-colors shadow-lg flex items-center gap-2 cursor-default">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                            Hoạt động: {profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('vi-VN') : 'Vừa xong'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid in Banner */}
                        {/* Stats Grid in Banner */}
                        {/* Stats Grid in Banner - ClassesPage Style */}
                        <div className="grid grid-cols-2 gap-3 w-full max-w-2xl lg:w-auto xl:w-auto">
                            {[
                                { label: 'Lớp học', value: stats.classesOwned, icon: FaGraduationCap },
                                { label: 'Quiz đã tạo', value: stats.quizzesOwned, icon: FaClipboardList },
                                { label: 'Đã hoàn thành', value: stats.quizzesTaken, icon: FaCheckCircle },
                                { label: 'Điểm trung bình', value: `${stats.averageScore}%`, icon: FaTrophy }
                            ].map((item, idx) => (
                                <div
                                    key={idx}
                                    className="
                                        relative bg-white border border-gray-200 rounded-xl py-2 px-4 text-left
                                        transition-all duration-500
                                        dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                                        dark:border-white/10 dark:ring-1 dark:ring-white/10
                                        overflow-hidden group isolate
                                        flex items-center gap-3
                                    "
                                    style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
                                >
                                    {/* Overlay pattern */}
                                    <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />

                                    {/* Shimmer effect */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                    {/* Center glow */}
                                    <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_70%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_70%)] rounded-xl" />

                                    {/* Icon */}
                                    <div className="relative z-10 text-blue-600 dark:text-gray-200">
                                        <item.icon className="text-xl" />
                                    </div>

                                    <div className="relative z-10 flex-1 min-w-0">
                                        <h3 className="text-xs font-mono text-blue-600/70 dark:text-gray-300 mt-0.5 truncate">
                                            {item.label}
                                        </h3>
                                        <p className="text-lg font-mono font-bold text-blue-600 dark:text-gray-50 leading-none truncate">
                                            {item.value}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs - Clean Segmented Style */}
            <div className="flex justify-center mb-10 px-4">
                <div className="flex flex-wrap justify-center p-1 gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-2xl">
                    {[
                        { id: 'overview', label: 'Tổng quan', icon: FaUser },
                        { id: 'history', label: 'Lịch sử', icon: FaHistory },
                        { id: 'management', label: 'Thống kê', icon: FaChartBar }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`
                                relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300
                                ${activeTab === tab.id
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/10'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/30'
                                }
                            `}
                        >
                            <tab.icon className="text-base" />
                            <span>{tab.label}</span>
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <style>{`
                /* Hide default password toggle in Edge/IE */
                input::-ms-reveal,
                input::-ms-clear {
                    display: none;
                }
                /* Gradient row dividers */
                .gradient-row-divider::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(to right, transparent, rgb(229, 231, 235), transparent);
                }
                .dark .gradient-row-divider::after {
                    background: linear-gradient(to right, transparent, rgba(55, 65, 81, 0.5), transparent);
                }
                /* Smooth tab content transitions */
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .tab-content {
                    animation: fadeIn 0.3s ease-out;
                }
            `}</style>
            <div className="min-h-[500px]">
                {activeTab === 'overview' && (
                    <div className="space-y-8 tab-content">
                        {/* Activity Graph Section - Moved to top */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
                            <div className="p-4 sm:p-8 md:p-10">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
                                    <FaChartBar className="text-blue-500" />
                                    Hoạt động làm bài
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                    Biểu đồ thể hiện số lần bạn đã làm bài kiểm tra theo năm
                                </p>
                                <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
                                    <ContributionGraph blockSize={12} showLabel={true} showYearSelector={true} />
                                </div>
                            </div>
                        </div>

                        {/* Settings Form - Premium Redesign */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
                            {/* Header removed for cleaner look, integrated into spacing */}

                            <div className="p-4 sm:p-8 md:p-10 space-y-8 sm:space-y-10">
                                {/* Section Header: Personal Info */}
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
                                        <FaUser className="text-blue-500" />
                                        Thông tin cá nhân
                                    </h2>

                                    <div className="grid gap-8">
                                        {/* Name Section */}
                                        <div className="group">
                                            <div className="flex justify-between items-baseline mb-2">
                                                <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tên người dùng</label>
                                                {!editingName && (
                                                    <button onClick={() => setEditingName(true)} className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1">
                                                        <FaEdit /> Chỉnh sửa
                                                    </button>
                                                )}
                                            </div>
                                            {editingName ? (
                                                <div className="flex flex-col sm:flex-row gap-3 animate-fadeIn mt-2">
                                                    <input
                                                        value={newName}
                                                        onChange={e => setNewName(e.target.value)}
                                                        maxLength={30}
                                                        className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all font-medium"
                                                        autoFocus
                                                        placeholder="Nhập tên hiển thị mới (tối đa 30 ký tự)"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button onClick={handleUpdateName} disabled={savingName} className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 whitespace-nowrap flex items-center justify-center gap-2">
                                                            {savingName ? (
                                                                <div style={{ transform: 'scale(0.022)' }}><SpinnerLoading /></div>
                                                            ) : 'Lưu'}
                                                        </button>
                                                        <button onClick={() => setEditingName(false)} className="px-5 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl font-bold transition-all">
                                                            Hủy
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-lg font-bold text-gray-900 dark:text-white border-b border-dashed border-gray-200 dark:border-gray-700 pb-1">
                                                    {profile.name}
                                                </div>
                                            )}
                                        </div>

                                        {/* Email Section */}
                                        <div className="group">
                                            <div className="flex justify-between items-baseline mb-2">
                                                <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</label>
                                                {!editingEmail && (
                                                    <button onClick={() => setEditingEmail(true)} className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1">
                                                        <FaEdit /> Thay đổi
                                                    </button>
                                                )}
                                            </div>
                                            {editingEmail ? (
                                                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50 animate-fadeIn mt-2 space-y-5">
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">EMAIL MỚI</label>
                                                        <input
                                                            value={newEmail}
                                                            onChange={e => setNewEmail(e.target.value)}
                                                            className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all font-medium"
                                                            placeholder="example@email.com"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">XÁC NHẬN MẬT KHẨU</label>
                                                        <input
                                                            type="password"
                                                            value={emailPassword}
                                                            onChange={e => setEmailPassword(e.target.value)}
                                                            className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all font-medium"
                                                            placeholder="••••••••"
                                                        />
                                                    </div>
                                                    <div className="flex gap-3 pt-2">
                                                        <button onClick={handleUpdateEmail} disabled={savingEmail} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
                                                            {savingEmail ? (
                                                                <div style={{ transform: 'scale(0.022)' }}><SpinnerLoading /></div>
                                                            ) : 'Cập nhật Email'}
                                                        </button>
                                                        <button onClick={() => setEditingEmail(false)} className="px-6 py-2.5 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl font-bold transition-all">
                                                            Hủy bỏ
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2 border-b border-dashed border-gray-200 dark:border-gray-700 pb-1">
                                                    {profile.email}
                                                    <span className="bg-green-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Unverified</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Password Section - Moved here */}
                                        <div className="group">
                                            <div className="flex justify-between items-baseline mb-2">
                                                <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mật khẩu</label>
                                                {!editingPassword && (
                                                    <button onClick={() => setEditingPassword(true)} className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1">
                                                        <FaEdit /> Cập nhật
                                                    </button>
                                                )}
                                            </div>

                                            {editingPassword ? (
                                                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50 animate-fadeIn mt-2 space-y-5">
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">MẬT KHẨU HIỆN TẠI</label>
                                                        <div className="relative">
                                                            <input
                                                                type={showCurrentPass ? "text" : "password"}
                                                                value={currentPassword}
                                                                onChange={e => setCurrentPassword(e.target.value)}
                                                                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white transition-all font-medium pr-10"
                                                                placeholder="••••••••"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowCurrentPass(!showCurrentPass)}
                                                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none"
                                                                tabIndex={-1}
                                                            >
                                                                {showCurrentPass ? (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                        <div>
                                                            <label className="text-xs font-bold text-gray-500 mb-1.5 block">MẬT KHẨU MỚI</label>
                                                            <div className="relative">
                                                                <input
                                                                    type={showNewPass ? "text" : "password"}
                                                                    value={newPassword}
                                                                    onChange={e => setNewPassword(e.target.value)}
                                                                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white transition-all font-medium pr-10"
                                                                    placeholder="Ít nhất 6 ký tự"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowNewPass(!showNewPass)}
                                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none"
                                                                    tabIndex={-1}
                                                                >
                                                                    {showNewPass ? (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-bold text-gray-500 mb-1.5 block">XÁC NHẬN MỚI</label>
                                                            <div className="relative">
                                                                <input
                                                                    type={showConfirmPass ? "text" : "password"}
                                                                    value={confirmPassword}
                                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white transition-all font-medium pr-10"
                                                                    placeholder="Nhập lại mật khẩu mới"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none"
                                                                    tabIndex={-1}
                                                                >
                                                                    {showConfirmPass ? (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 pt-2">
                                                        <button onClick={handleChangePassword} disabled={savingPassword} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
                                                            {savingPassword ? (
                                                                <div style={{ transform: 'scale(0.022)' }}><SpinnerLoading /></div>
                                                            ) : 'Đổi mật khẩu'}
                                                        </button>
                                                        <button onClick={() => setEditingPassword(false)} className="px-6 py-2.5 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl font-bold transition-all">
                                                            Hủy bỏ
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between py-2 border-b border-dashed border-gray-200 dark:border-gray-700 pb-1">
                                                    <div className="flex items-center gap-1.5">
                                                        {[...Array(8)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600"></div>)}
                                                    </div>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        Lần cuối: {profile.passwordChangedAt
                                                            ? new Date(profile.passwordChangedAt).toLocaleDateString('vi-VN')
                                                            : 'Chưa cập nhật'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-6 tab-content">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                <FaHistory className="text-blue-500" /> Lịch sử làm bài
                            </h2>

                            {stats.recentSessions.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <FaClock className="mx-auto text-4xl text-gray-300 dark:text-gray-600 mb-4" />
                                    <p className="text-gray-500 dark:text-gray-400 font-medium">Bạn chưa thực hiện bài kiểm tra nào.</p>
                                </div>
                            ) : (
                                <div className="grid gap-5 max-h-[65vh] overflow-y-auto custom-scrollbar pr-2 py-4">
                                    {stats.recentSessions.map(session => (
                                        <div key={session.id} className="group relative bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 border-l-4 border-l-gray-300 dark:border-l-gray-600 hover:border-l-primary-500 dark:hover:border-l-primary-500 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-900/50 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden">
                                            {/* Decorative side bar - REMOVED since border-l-4 replaces it */}

                                            <div className="flex-1 z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg text-xs font-medium tracking-wider flex items-center gap-1.5">
                                                        <FaGraduationCap /> {session.className}
                                                    </span>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="text-gray-400 text-xs font-medium flex items-center gap-1">
                                                        <FaClock className="text-[10px]" /> {formatDateTime(session.completedAt)}
                                                    </span>
                                                </div>
                                                <h3 className="font-medium text-lg dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {session.quizTitle}
                                                </h3>
                                            </div>

                                            <div className="flex items-center justify-between md:justify-end gap-8 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-0 border-gray-100 dark:border-gray-700 z-10">
                                                <div className="text-center group-hover:scale-105 transition-transform duration-300">
                                                    <span className="block text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-1">Điểm số</span>
                                                    <span className="font-semibold text-2xl text-gray-900 dark:text-white">
                                                        {session.score}<span className="text-gray-400 text-sm">/{session.totalQuestions}</span>
                                                    </span>
                                                </div>

                                                <div className="text-center min-w-[60px]">
                                                    <div className={`
                                                        w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shadow-inner
                                                        ${session.percentage >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-2 ring-green-500/10' :
                                                            session.percentage >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-2 ring-yellow-500/10' :
                                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ring-2 ring-red-500/10'
                                                        }
                                                    `}>
                                                        {session.percentage}%
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => navigate(`/results/${session.quizId}`, { state: { sessionId: session.id, fromProfile: true, activeTab: 'history' } })}
                                                    className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 text-gray-400 flex items-center justify-center transition-all duration-300 shadow-sm hover:shadow-lg"
                                                    title="Xem chi tiết"
                                                >
                                                    <FaArrowRight />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'management' && (
                    <div className="space-y-8 tab-content">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
                            <div className="p-8 sm:p-10">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                                    <FaChartBar className="text-blue-500" />
                                    Thống kê chi tiết
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 italic">Xem chi tiết kết quả và phân tích bài làm của học viên</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Class Custom Dropdown */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Chọn Lớp học</label>
                                        <div className="relative custom-dropdown-container">
                                            <button
                                                className={`
                                                    w-full text-left appearance-none border border-gray-200 dark:border-gray-700 
                                                    rounded-xl px-4 py-3 bg-white dark:bg-gray-800 
                                                    focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 
                                                    transition-all duration-200 flex justify-between items-center shadow-sm hover:shadow-md
                                                    ${openDropdown === 'class' ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}
                                                `}
                                                onClick={() => setOpenDropdown(openDropdown === 'class' ? null : 'class')}
                                            >
                                                <span className={`flex-1 text-left font-medium ${selectedClass ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                                    {selectedClass ? selectedClass.name : '-- Chọn lớp học --'}
                                                </span>
                                                <FaChevronDown className={`text-xs text-gray-400 transition-transform duration-300 ${openDropdown === 'class' ? 'rotate-180 text-blue-500' : ''}`} />
                                            </button>

                                            {openDropdown === 'class' && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden animate-slideUp text-left">
                                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                        {myClasses.length === 0 ? (
                                                            <div className="px-4 py-3 text-gray-500 text-sm">Bạn chưa có lớp học nào</div>
                                                        ) : (
                                                            myClasses.map(c => (
                                                                <button
                                                                    key={c.id}
                                                                    onClick={() => {
                                                                        setSelectedClassId(c.id);
                                                                        setOpenDropdown(null);
                                                                    }}
                                                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedClassId === c.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                                                                >
                                                                    <span className="text-left">{c.name}</span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quiz Custom Dropdown */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Chọn Bài kiểm tra</label>
                                        <div className="relative custom-dropdown-container">
                                            <button
                                                className={`
                                                    w-full text-left appearance-none border rounded-xl px-4 py-3 
                                                    focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 
                                                    transition-all duration-200 flex justify-between items-center shadow-sm
                                                    ${!selectedClassId
                                                        ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed'
                                                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
                                                    }
                                                    ${openDropdown === 'quiz' ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}
                                                `}
                                                onClick={() => selectedClassId && setOpenDropdown(openDropdown === 'quiz' ? null : 'quiz')}
                                                disabled={!selectedClassId}
                                            >
                                                <span className={`flex-1 text-left font-medium ${selectedQuiz ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                                    {selectedQuiz ? selectedQuiz.title : (!selectedClassId ? '-- Chọn lớp học trước --' : '-- Chọn bài kiểm tra --')}
                                                </span>
                                                <FaChevronDown className={`text-xs text-gray-400 transition-transform duration-300 ${openDropdown === 'quiz' ? 'rotate-180 text-blue-500' : ''}`} />
                                            </button>

                                            {openDropdown === 'quiz' && selectedClassId && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden animate-slideUp text-left">
                                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                        {classQuizzes.length === 0 ? (
                                                            <div className="px-4 py-3 text-gray-500 text-sm">Lớp chưa có quiz nào</div>
                                                        ) : (
                                                            classQuizzes.map(q => (
                                                                <button
                                                                    key={q.id}
                                                                    onClick={() => {
                                                                        setSelectedQuizId(q.id);
                                                                        setOpenDropdown(null);
                                                                    }}
                                                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedQuizId === q.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                                                                >
                                                                    <span className="text-left">{q.title}</span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {quizDetails && (
                            <div className="space-y-8 animate-slideUpIn">
                                {/* Overview Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        { label: 'Tổng lượt làm bài', value: quizDetails.stats.totalAttempts, icon: FaClipboardList, color: 'blue' },
                                        { label: 'Điểm trung bình', value: `${quizDetails.stats.avgScore.toFixed(1)}%`, icon: FaTrophy, color: 'green' },
                                        { label: 'Người tham gia', value: quizDetails.stats.uniqueUsers, icon: FaUsers, color: 'purple' }
                                    ].map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="
                                                relative bg-white border border-gray-200 rounded-2xl p-4 text-left
                                                transition-all duration-300 hover:shadow-xl hover:-translate-y-1
                                                dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900
                                                dark:border-white/10 dark:ring-1 dark:ring-white/5
                                                overflow-hidden group isolate
                                                flex flex-row items-center justify-between gap-4
                                            "
                                            style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
                                        >
                                            {/* Overlay pattern elements */}
                                            <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-2xl bg-${item.color}-50 dark:bg-white/10 flex items-center justify-center text-${item.color}-600 dark:text-${item.color}-400 shadow-sm group-hover:scale-110 transition-transform duration-300 flex-shrink-0`}>
                                                    <item.icon className="text-lg" />
                                                </div>
                                                <h3 className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider">{item.label}</h3>
                                            </div>

                                            <div>
                                                <p className="text-xl font-mono font-bold text-gray-900 dark:text-white leading-none text-right">{item.value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Results Table */}
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                                    <div className="p-6 relative flex justify-between items-center">
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                                        <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                            <FaClipboardList className="text-blue-500" /> Kết quả chi tiết
                                            <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">{quizDetails.sessions.length}</span>
                                        </h3>
                                    </div>

                                    {quizDetails.sessions.length === 0 ? (
                                        <div className="p-12 text-center text-gray-500">
                                            Chưa có dữ liệu bài làm nào.
                                        </div>
                                    ) : (
                                        <>
                                            {/* Desktop Table View */}
                                            <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                                                <table className="w-full text-left border-collapse">
                                                    <thead className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold relative">
                                                        <tr>
                                                            <th className="py-4 px-6">Học viên</th>
                                                            <th className="py-4 px-6">Điểm số</th>
                                                            <th className="py-4 px-6">Thời gian</th>
                                                            <th className="py-4 px-6 text-right">Thao tác</th>
                                                        </tr>
                                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                                                    </thead>
                                                    <tbody>
                                                        {quizDetails.sessions.map((s: any) => (
                                                            <tr key={s.id} className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors duration-200 relative gradient-row-divider">
                                                                <td className="py-4 px-6 align-middle">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
                                                                            {s.userName.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <span className="font-medium text-gray-900 dark:text-white">{s.userName}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-6 align-middle">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium text-gray-900 dark:text-white text-lg">{s.score}/{s.totalQuestions}</span>
                                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${(s.score / s.totalQuestions) >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                                            (s.score / s.totalQuestions) >= 0.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                                            }`}>
                                                                            {Math.round((s.score / s.totalQuestions) * 100)}%
                                                                        </span>
                                                                        <div className="relative h-1.5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`absolute top-0 left-0 h-full rounded-full ${(s.score / s.totalQuestions) >= 0.8 ? 'bg-green-500' :
                                                                                    (s.score / s.totalQuestions) >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                                                                    }`}
                                                                                style={{ width: `${(s.score / s.totalQuestions) * 100}%` }}
                                                                            ></div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-6 align-middle text-sm text-gray-500 font-mono">
                                                                    {formatDateTime(s.completedAt)}
                                                                </td>
                                                                <td className="py-4 px-6 align-middle text-right">
                                                                    <button
                                                                        onClick={() => navigate(`/results/${quizDetails.quizId || selectedQuizId}`, {
                                                                            state: {
                                                                                sessionId: s.id,
                                                                                fromProfile: true,
                                                                                activeTab: 'management',
                                                                                selectedClassId,
                                                                                selectedQuizId
                                                                            }
                                                                        })}
                                                                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-all shadow-sm hover:shadow-md"
                                                                    >
                                                                        Chi tiết
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Mobile Card View */}
                                            <div className="md:hidden p-4 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                                                {quizDetails.sessions.map((s: any) => (
                                                    <div key={s.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-3 relative gradient-row-divider">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0">
                                                                {s.userName.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold text-gray-900 dark:text-white truncate">{s.userName}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{formatDateTime(s.completedAt)}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">Điểm số</div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className="font-bold text-2xl text-gray-900 dark:text-white">{s.score}</span>
                                                                        <span className="text-gray-400 text-base">/{s.totalQuestions}</span>
                                                                    </div>
                                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm ${(s.score / s.totalQuestions) >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                                        (s.score / s.totalQuestions) >= 0.5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                                        }`}>
                                                                        {Math.round((s.score / s.totalQuestions) * 100)}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="relative h-2 w-24 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`absolute top-0 left-0 h-full rounded-full ${(s.score / s.totalQuestions) >= 0.8 ? 'bg-green-500' :
                                                                        (s.score / s.totalQuestions) >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                                                        }`}
                                                                    style={{ width: `${(s.score / s.totalQuestions) * 100}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => navigate(`/results/${quizDetails.quizId || selectedQuizId}`, {
                                                                state: {
                                                                    sessionId: s.id,
                                                                    fromProfile: true,
                                                                    activeTab: 'management',
                                                                    selectedClassId,
                                                                    selectedQuizId
                                                                }
                                                            })}
                                                            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95"
                                                        >
                                                            Xem chi tiết
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Access List */}
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                                    <div className="p-6 relative">
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                                        <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                            <FaUsers className="text-blue-500" /> Danh sách quyền truy cập
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">Những người dùng được cấp quyền truy cập riêng tư</p>
                                    </div>
                                    {/* Desktop Table View */}
                                    <div className="hidden md:block overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold relative">
                                                <tr>
                                                    <th className="py-4 px-6">Người dùng</th>
                                                    <th className="py-4 px-6">Quyền hạn</th>
                                                    <th className="py-4 px-6">Ngày tham gia</th>
                                                </tr>
                                                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
                                            </thead>
                                            <tbody>
                                                {quizDetails.accessList && quizDetails.accessList.length > 0 ? (
                                                    quizDetails.accessList.map((a: any) => (
                                                        <tr key={a.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors relative gradient-row-divider">
                                                            <td className="py-4 px-6">
                                                                <div className="font-medium text-gray-900 dark:text-white">{a.name}</div>
                                                            </td>
                                                            <td className="py-4 px-6">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${a.accessLevel === 'full'
                                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                                    }`}>
                                                                    {a.accessLevel === 'full' ? 'Xem & Làm bài' : 'Chỉ xem'}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-300 font-mono">
                                                                {formatDateTime(a.joinedAt)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={3} className="py-8 text-center text-gray-500 italic">Chưa có thành viên nào trong danh sách truy cập.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card View */}
                                    <div className="md:hidden p-4 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {quizDetails.accessList && quizDetails.accessList.length > 0 ? (
                                            quizDetails.accessList.map((a: any) => (
                                                <div key={a.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-3 relative gradient-row-divider">
                                                    <div>
                                                        <div className="font-bold text-gray-900 dark:text-white">{a.name}</div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">Quyền hạn</div>
                                                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${a.accessLevel === 'full'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                                }`}>
                                                                {a.accessLevel === 'full' ? 'Xem & Làm bài' : 'Chỉ xem'}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">Tham gia</div>
                                                            <div className="text-sm text-gray-600 dark:text-gray-300 font-mono">{formatDateTime(a.joinedAt)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="py-8 text-center text-gray-500 italic">Chưa có thành viên nào trong danh sách truy cập.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfilePage;
