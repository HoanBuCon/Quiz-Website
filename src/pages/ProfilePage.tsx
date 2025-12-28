import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { FaUser, FaEnvelope, FaLock, FaSave, FaTimes, FaEdit, FaGraduationCap, FaClipboardList, FaTrophy, FaClock, FaChartBar, FaHistory, FaUsers, FaArrowRight, FaEye, FaChevronDown } from 'react-icons/fa';
import { getApiBaseUrl, StatsAPI } from '../utils/api';
import { getToken } from '../utils/auth';
import { toast } from 'react-hot-toast';

interface UserProfile {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    lastLoginAt?: string;
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

    const API_URL = getApiBaseUrl();

    useEffect(() => {
        loadProfileData();
    }, []);

    useEffect(() => {
        if (activeTab === 'management' && myClasses.length === 0) {
            loadMyClasses();
        }
    }, [activeTab]);

    useEffect(() => {
        if (selectedClassId) {
            loadClassQuizzes(selectedClassId);
            setSelectedQuizId('');
            setQuizDetails(null);
        }
    }, [selectedClassId]);

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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    if (!profile || !stats) return <div className="text-center p-10">Error loading profile</div>;

    const selectedClass = myClasses.find(c => c.id === selectedClassId);
    const selectedQuiz = classQuizzes.find(q => q.id === selectedQuizId);

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
                    <div className="absolute inset-0 opacity-30 bg-gradient-to-r from-transparent via-white/65 to-transparent blur-[3px] animate-[shimmer_3s_ease-in-out_infinite] [mask-image:linear-gradient(to_right,transparent_0%,black_20%,black_80%,transparent_100%)] mix-blend-overlay rounded-2xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-md border-2 border-white/20 flex items-center justify-center text-white text-4xl font-bold shadow-xl">
                            {profile.name ? profile.name.charAt(0).toUpperCase() : profile.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-center sm:text-left">
                            <h1 className="text-3xl sm:text-4xl font-mono font-bold text-white mb-2 tracking-tight">
                                {profile.name || 'User'}
                            </h1>
                            <p className="text-blue-100 font-mono text-lg flex items-center justify-center sm:justify-start gap-2">
                                <FaEnvelope className="text-sm opacity-70" /> {profile.email}
                            </p>
                            <div className="mt-3 flex items-center justify-center sm:justify-start gap-3">
                                <span className="px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs text-white font-medium border border-white/10">
                                    Thành viên từ {new Date(profile.createdAt).toLocaleDateString('vi-VN')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex justify-center mb-8">
                <div className="bg-white dark:bg-gray-800 p-1 rounded-xl shadow-lg inline-flex flex-wrap justify-center sm:justify-start gap-1">
                    {[
                        { id: 'overview', label: 'Tổng quan', icon: FaUser },
                        { id: 'history', label: 'Lịch sử', icon: FaHistory },
                        { id: 'management', label: 'Thống kê', icon: FaChartBar }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`
                                flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all duration-300
                                ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-md transform scale-105'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                                }
                            `}
                        >
                            <tab.icon className={activeTab === tab.id ? 'text-white' : ''} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="min-h-[500px] animate-slideUpIn">
                {activeTab === 'overview' && (
                    <div className="space-y-8">
                        {/* Stats Grid - HomePage Style */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { label: 'Lớp học', value: stats.classesOwned, icon: FaGraduationCap },
                                { label: 'Quiz đã tạo', value: stats.quizzesOwned, icon: FaClipboardList },
                                { label: 'Quiz đã làm', value: stats.quizzesTaken, icon: FaClock },
                                { label: 'Điểm trung bình', value: `${stats.averageScore}%`, icon: FaTrophy }
                            ].map((item, idx) => (
                                <div
                                    key={idx}
                                    className="
                                        relative bg-white border border-gray-200 rounded-xl p-6 text-left
                                        transition-shadow duration-300 hover:shadow-lg
                                        dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800
                                        dark:border-white/10 dark:ring-1 dark:ring-white/10
                                        overflow-hidden group isolate
                                    "
                                    style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}
                                >
                                    {/* Overlay pattern */}
                                    <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />

                                    {/* Subtler shimmer effect */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                    <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-white/10 flex items-center justify-center text-blue-600 dark:text-white mb-4 shadow-sm z-10 relative">
                                        <item.icon className="text-xl" />
                                    </div>
                                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium z-10 relative">{item.label}</h3>
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1 z-10 relative">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Settings Form */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                            <div className="p-6 sm:p-8 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                    <FaUser className="text-blue-500" /> Thông tin tài khoản
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mt-1">Quản lý thông tin cá nhân</p>
                            </div>

                            <div className="p-6 sm:p-8 space-y-8">
                                {/* Name Section */}
                                <div className="group">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Tên người dùng</label>
                                        {!editingName && (
                                            <button onClick={() => setEditingName(true)} className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline flex items-center gap-1">
                                                <FaEdit /> Chỉnh sửa
                                            </button>
                                        )}
                                    </div>
                                    {editingName ? (
                                        <div className="flex gap-3 animate-fadeIn">
                                            <input
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:ring-2 focus:ring-blue-500 dark:text-white transition-all"
                                                autoFocus
                                            />
                                            <button onClick={handleUpdateName} disabled={savingName} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-colors">
                                                {savingName ? 'Lưu...' : 'Lưu'}
                                            </button>
                                            <button onClick={() => setEditingName(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg font-medium transition-colors">
                                                Hủy
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                                            <p className="text-lg font-medium text-gray-900 dark:text-white">{profile.name}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-gray-100 dark:bg-gray-700"></div>

                                {/* Email Section */}
                                <div className="group">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Email</label>
                                        {!editingEmail && (
                                            <button onClick={() => setEditingEmail(true)} className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline flex items-center gap-1">
                                                <FaEdit /> Chỉnh sửa
                                            </button>
                                        )}
                                    </div>
                                    {editingEmail ? (
                                        <div className="space-y-4 animate-fadeIn bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
                                            <input
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                placeholder="Email mới"
                                            />
                                            <input
                                                type="password"
                                                value={emailPassword}
                                                onChange={e => setEmailPassword(e.target.value)}
                                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                placeholder="Xác nhận mật khẩu hiện tại"
                                            />
                                            <div className="flex gap-3">
                                                <button onClick={handleUpdateEmail} disabled={savingEmail} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md">
                                                    {savingEmail ? 'Đang lưu...' : 'Lưu thay đổi'}
                                                </button>
                                                <button onClick={() => setEditingEmail(false)} className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg font-medium">
                                                    Hủy
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                                            <FaEnvelope className="text-gray-400" />
                                            <p className="text-lg font-medium text-gray-900 dark:text-white">{profile.email}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-gray-100 dark:bg-gray-700"></div>

                                {/* Password Section */}
                                <div className="group">
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Mật khẩu</label>
                                        {!editingPassword && (
                                            <button onClick={() => setEditingPassword(true)} className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline flex items-center gap-1">
                                                <FaLock /> Đổi mật khẩu
                                            </button>
                                        )}
                                    </div>
                                    {editingPassword ? (
                                        <div className="space-y-4 animate-fadeIn bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
                                            <input
                                                type="password"
                                                value={currentPassword}
                                                onChange={e => setCurrentPassword(e.target.value)}
                                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                placeholder="Mật khẩu hiện tại"
                                            />
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                    placeholder="Mật khẩu mới"
                                                />
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                    placeholder="Xác nhận mật khẩu mới"
                                                />
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={handleChangePassword} disabled={savingPassword} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md">
                                                    {savingPassword ? 'Đang lưu...' : 'Lưu thay đổi'}
                                                </button>
                                                <button onClick={() => setEditingPassword(false)} className="px-5 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg font-medium">
                                                    Hủy
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="flex gap-1">
                                                    {[...Array(8)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-gray-400"></div>)}
                                                </span>
                                            </div>
                                            <span className="text-sm text-gray-500">Cập nhật lần cuối: Gần đây</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8">
                            <h2 className="text-2xl font-bold dark:text-white mb-6 flex items-center gap-3">
                                <FaHistory className="text-blue-500" /> Lịch sử làm bài
                            </h2>

                            {stats.recentSessions.length === 0 ? (
                                <div className="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <FaClock className="mx-auto text-4xl text-gray-300 dark:text-gray-600 mb-4" />
                                    <p className="text-gray-500 dark:text-gray-400 font-medium">Bạn chưa thực hiện bài kiểm tra nào.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {stats.recentSessions.map(session => (
                                        <div key={session.id} className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-lg dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                    {session.quizTitle}
                                                </h3>
                                                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs font-semibold">
                                                        {session.className}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{formatDateTime(session.completedAt)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-gray-100 dark:border-gray-700">
                                                <div className="text-center">
                                                    <span className="block text-xs uppercase tracking-wider text-gray-400 font-semibold">Điểm số</span>
                                                    <span className="font-bold text-xl dark:text-white">{session.score} <span className="text-sm text-gray-400 font-normal">/ {session.totalQuestions}</span></span>
                                                </div>

                                                <div className="text-center min-w-[60px]">
                                                    <span className="block text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">Kết quả</span>
                                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${session.percentage >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                        session.percentage >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                        {session.percentage}%
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => navigate(`/quiz/${session.quizId}/result`, { state: { sessionId: session.id } })}
                                                    className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
                                                >
                                                    Xem lại <FaArrowRight />
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
                    <div className="space-y-8">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                            <div className="p-6 sm:p-8 bg-gradient-to-r from-blue-50 to-white dark:from-gray-800 dark:to-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                    <FaChartBar className="text-blue-500" /> Thống kê chi tiết
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mt-1">Xem chi tiết kết quả và phân tích bài làm của học viên</p>
                            </div>

                            <div className="p-6 sm:p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Class Custom Dropdown */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">Chọn Lớp học</label>
                                        <div className="relative custom-dropdown-container">
                                            <button
                                                className="w-full text-left appearance-none border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl px-4 py-3 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex justify-between items-center"
                                                onClick={() => setOpenDropdown(openDropdown === 'class' ? null : 'class')}
                                            >
                                                <span>{selectedClass ? selectedClass.name : '-- Chọn một lớp học --'}</span>
                                                <FaChevronDown className={`text-sm text-gray-500 transition-transform ${openDropdown === 'class' ? 'rotate-180' : ''}`} />
                                            </button>

                                            {openDropdown === 'class' && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden animate-slideUp">
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
                                                                    {c.name}
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
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">Chọn Bài kiểm tra</label>
                                        <div className="relative custom-dropdown-container">
                                            <button
                                                className={`w-full text-left appearance-none border-2 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex justify-between items-center ${!selectedClassId
                                                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:border-gray-700'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 dark:bg-gray-700 dark:text-white'
                                                    }`}
                                                onClick={() => selectedClassId && setOpenDropdown(openDropdown === 'quiz' ? null : 'quiz')}
                                                disabled={!selectedClassId}
                                            >
                                                <span>{selectedQuiz ? selectedQuiz.title : (!selectedClassId ? '-- Chọn lớp học trước --' : '-- Chọn bài kiểm tra --')}</span>
                                                <FaChevronDown className={`text-sm text-gray-500 transition-transform ${openDropdown === 'quiz' ? 'rotate-180' : ''}`} />
                                            </button>

                                            {openDropdown === 'quiz' && selectedClassId && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden animate-slideUp">
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
                                                                    {q.title}
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 flex justify-center sm:justify-start">
                                    <button
                                        onClick={handleLoadQuizStats}
                                        disabled={!selectedQuizId || loadingStats}
                                        className="btn-primary w-full sm:w-auto px-8 py-3 rounded-xl shadow-lg hover:shadow-xl text-white font-bold flex items-center justify-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ background: 'linear-gradient(to right, #2563eb, #1d4ed8)' }}
                                    >
                                        {loadingStats ? (
                                            <>
                                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                Đang tải...
                                            </>
                                        ) : (
                                            <>
                                                <FaChartBar /> Xem Thống Kê
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {quizDetails && (
                            <div className="space-y-8 animate-slideUpIn">
                                {/* Overview Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="relative bg-white border border-gray-200 rounded-xl p-6 text-left transition-shadow duration-300 hover:shadow-lg dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800 dark:border-white/10 dark:ring-1 dark:ring-white/10 overflow-hidden group isolate" style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}>
                                        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full transition-transform"></div>
                                        <p className="text-gray-500 dark:text-gray-400 font-medium z-10 relative">Tổng lượt làm bài</p>
                                        <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2 group-hover:text-blue-600 transition-colors z-10 relative">{quizDetails.stats.totalAttempts}</p>
                                        <FaClipboardList className="absolute bottom-6 right-6 text-4xl text-blue-500/20 z-10" />
                                    </div>

                                    <div className="relative bg-white border border-gray-200 rounded-xl p-6 text-left transition-shadow duration-300 hover:shadow-lg dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800 dark:border-white/10 dark:ring-1 dark:ring-white/10 overflow-hidden group isolate" style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}>
                                        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-bl-full transition-transform"></div>
                                        <p className="text-gray-500 dark:text-gray-400 font-medium z-10 relative">Điểm trung bình</p>
                                        <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2 group-hover:text-green-600 transition-colors z-10 relative">{quizDetails.stats.avgScore.toFixed(1)}%</p>
                                        <FaTrophy className="absolute bottom-6 right-6 text-4xl text-green-500/20 z-10" />
                                    </div>

                                    <div className="relative bg-white border border-gray-200 rounded-xl p-6 text-left transition-shadow duration-300 hover:shadow-lg dark:bg-gradient-to-br dark:from-slate-700 dark:to-gray-800 dark:border-white/10 dark:ring-1 dark:ring-white/10 overflow-hidden group isolate" style={{ WebkitMaskImage: '-webkit-radial-gradient(white, white)' } as React.CSSProperties}>
                                        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(135deg,_rgba(0,0,0,0.08)_0px,_rgba(0,0,0,0.08)_1px,_transparent_1px,_transparent_8px)] dark:bg-[repeating-linear-gradient(135deg,_rgba(255,255,255,0.15)_0px,_rgba(255,255,255,0.15)_1px,_transparent_1px,_transparent_8px)] rounded-xl pointer-events-none" />
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-1000 bg-gradient-to-r from-transparent via-white/80 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] blur-[2px] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-xl mix-blend-overlay pointer-events-none" />

                                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full transition-transform"></div>
                                        <p className="text-gray-500 dark:text-gray-400 font-medium z-10 relative">Người tham gia</p>
                                        <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2 group-hover:text-purple-600 transition-colors z-10 relative">{quizDetails.stats.uniqueUsers}</p>
                                        <FaUsers className="absolute bottom-6 right-6 text-4xl text-purple-500/20 z-10" />
                                    </div>
                                </div>

                                {/* Results Table */}
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
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
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold">
                                                    <tr>
                                                        <th className="py-4 px-6">Học viên</th>
                                                        <th className="py-4 px-6">Điểm số</th>
                                                        <th className="py-4 px-6">Thời gian</th>
                                                        <th className="py-4 px-6 text-right">Thao tác</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                    {quizDetails.sessions.map((s: any) => (
                                                        <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                            <td className="py-4 px-6">
                                                                <div className="font-bold text-gray-900 dark:text-white">{s.userName}</div>
                                                                <div className="text-sm text-gray-500">{s.userEmail}</div>
                                                            </td>
                                                            <td className="py-4 px-6">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-gray-900 dark:text-white text-lg">{s.score}/{s.totalQuestions}</span>
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${(s.score / s.totalQuestions) >= 0.5 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                        }`}>
                                                                        {Math.round((s.score / s.totalQuestions) * 100)}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-300">
                                                                {formatDateTime(s.completedAt)}
                                                            </td>
                                                            <td className="py-4 px-6 text-right">
                                                                <button
                                                                    onClick={() => navigate(`/quiz/${quizDetails.quizId || selectedQuizId}/result`, { state: { sessionId: s.id } })}
                                                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-semibold hover:underline"
                                                                >
                                                                    Xem chi tiết
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Access List */}
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                            <FaUsers className="text-blue-500" /> Danh sách quyền truy cập
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">Những người dùng được cấp quyền truy cập riêng tư</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold">
                                                <tr>
                                                    <th className="py-4 px-6">Người dùng</th>
                                                    <th className="py-4 px-6">Quyền hạn</th>
                                                    <th className="py-4 px-6">Ngày tham gia</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                {quizDetails.accessList && quizDetails.accessList.length > 0 ? (
                                                    quizDetails.accessList.map((a: any) => (
                                                        <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                            <td className="py-4 px-6">
                                                                <div className="font-bold text-gray-900 dark:text-white">{a.name}</div>
                                                                <div className="text-sm text-gray-500">{a.email}</div>
                                                            </td>
                                                            <td className="py-4 px-6">
                                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs font-bold">
                                                                    {a.accessLevel === 'full' ? 'Làm bài & Xem' : 'Chỉ xem'}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-300">
                                                                {formatDateTime(a.joinedAt)}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={3} className="py-8 text-center text-gray-500">Chưa có thành viên nào trong danh sách truy cập.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
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
