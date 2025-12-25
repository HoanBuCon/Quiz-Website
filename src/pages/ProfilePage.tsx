import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { FaUser, FaEnvelope, FaLock, FaSave, FaTimes, FaEdit, FaGraduationCap, FaClipboardList, FaTrophy, FaClock } from 'react-icons/fa';
import { getApiBaseUrl } from '../utils/api';
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
    quizTitle: string;
    className: string;
    score: number;
    totalQuestions: number;
    percentage: number;
    completedAt: string;
}

// Custom Password Input with custom Eye Icons from MaintenancePage
const PasswordInput = ({
    value,
    onChange,
    placeholder
}: {
    value: string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    placeholder: string
}) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="relative group">
            <input
                type={showPassword ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder={placeholder}
            />
            <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors focus:outline-none"
                tabIndex={-1}
            >
                {showPassword ? (
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
    );
};

const ProfilePage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [stats, setStats] = useState<UserStats | null>(null);

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

    const loadProfileData = async () => {
        try {
            setLoading(true);
            const token = getToken();
            if (!token) {
                navigate('/login');
                return;
            }

            // Load profile and stats in parallel
            const [profileRes, statsRes] = await Promise.all([
                fetch(`${API_URL}/profile`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_URL}/profile/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (!profileRes.ok || !statsRes.ok) throw new Error('Failed to load data');

            const profileData = await profileRes.json();
            const statsData = await statsRes.json();

            setProfile(profileData);
            setStats(statsData);
            setNewName(profileData.name || '');
            setNewEmail(profileData.email);
        } catch (error) {
            // console.error('Load profile error:', error);
            toast.error('Không thể tải thông tin profile');
        } finally {
            setLoading(false);
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
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: newName.trim() })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Update failed');
            }

            toast.success('Cập nhật tên thành công!');
            setProfile(prev => prev ? { ...prev, name: newName.trim() } : null);
            setEditingName(false);

            // Trigger Header update
            window.dispatchEvent(new Event('authChange'));
        } catch (error: any) {
            toast.error(error.message || 'Không thể cập nhật tên');
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
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ email: newEmail, password: emailPassword })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Update failed');
            }

            toast.success('Cập nhật email thành công!');
            setProfile(prev => prev ? { ...prev, email: newEmail } : null);
            setEditingEmail(false);
            setEmailPassword('');
        } catch (error: any) {
            toast.error(error.message || 'Không thể cập nhật email');
        } finally {
            setSavingEmail(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 6) {
            toast.error('Mật khẩu mới phải có ít nhất 6 ký tự');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('Mật khẩu xác nhận không khớp');
            return;
        }

        try {
            setSavingPassword(true);
            const token = getToken();
            const res = await fetch(`${API_URL}/profile/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Update failed');
            }

            toast.success('Đổi mật khẩu thành công!');
            setEditingPassword(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.message || 'Không thể đổi mật khẩu');
        } finally {
            setSavingPassword(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: '2-digit'
        });
    };

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
                {(() => {
                    const Any = require("../components/Spinner").default;
                    return <Any size={40} />;
                })()}
            </div>
        );
    }

    if (!profile || !stats) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400">Không thể tải thông tin profile</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Profile Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 md:p-8">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Avatar */}
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                            {profile.name ? profile.name.charAt(0).toUpperCase() : profile.email.charAt(0).toUpperCase()}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 text-center sm:text-left">
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                {profile.name || 'User'}
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">{profile.email}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                                Thành viên từ {formatDate(profile.createdAt)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Statistics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">Lớp học sở hữu</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.classesOwned}</p>
                            </div>
                            <FaGraduationCap className="text-4xl text-blue-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-green-500">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">Quiz đã tạo</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.quizzesOwned}</p>
                            </div>
                            <FaClipboardList className="text-4xl text-green-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">Quiz đã làm</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.quizzesTaken}</p>
                            </div>
                            <FaClock className="text-4xl text-purple-500 opacity-50" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-yellow-500">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">Điểm trung bình</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.averageScore}%</p>
                            </div>
                            <FaTrophy className="text-4xl text-yellow-500 opacity-50" />
                        </div>
                    </div>
                </div>

                {/* Account Settings */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 md:p-8">
                    <h2 className="text-2xl font-mono font-bold text-gray-900 dark:text-white mb-6">Thông tin tài khoản</h2>

                    <div className="space-y-6">
                        {/* Username */}
                        <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                            <div className="flex items-center justify-between mb-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <FaUser className="text-blue-500" />
                                    Tên người dùng
                                </label>
                                {!editingName && (
                                    <button
                                        onClick={() => setEditingName(true)}
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                                    >
                                        <FaEdit /> Đổi tên
                                    </button>
                                )}
                            </div>

                            {editingName ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        maxLength={30}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên mới"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleUpdateName}
                                            disabled={savingName}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <FaSave /> {savingName ? 'Đang lưu...' : 'Lưu'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingName(false);
                                                setNewName(profile.name || '');
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                        >
                                            <FaTimes /> Hủy
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-900 dark:text-white font-medium">{profile.name || 'Chưa đặt tên'}</p>
                            )}
                        </div>

                        {/* Email */}
                        <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
                            <div className="flex items-center justify-between mb-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <FaEnvelope className="text-green-500" />
                                    Email
                                </label>
                                {!editingEmail && (
                                    <button
                                        onClick={() => setEditingEmail(true)}
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                                    >
                                        <FaEdit /> Đổi Email
                                    </button>
                                )}
                            </div>

                            {editingEmail ? (
                                <div className="space-y-3">
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập email mới"
                                    />
                                    <PasswordInput
                                        value={emailPassword}
                                        onChange={(e) => setEmailPassword(e.target.value)}
                                        placeholder="Nhập mật khẩu hiện tại để xác nhận"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleUpdateEmail}
                                            disabled={savingEmail}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <FaSave /> {savingEmail ? 'Đang lưu...' : 'Lưu'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingEmail(false);
                                                setNewEmail(profile.email);
                                                setEmailPassword('');
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                        >
                                            <FaTimes /> Hủy
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-900 dark:text-white font-medium">{profile.email}</p>
                            )}
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    <FaLock className="text-red-500" />
                                    Mật khẩu
                                </label>
                                {!editingPassword && (
                                    <button
                                        onClick={() => setEditingPassword(true)}
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                                    >
                                        <FaEdit /> Đổi mật khẩu
                                    </button>
                                )}
                            </div>

                            {editingPassword ? (
                                <div className="space-y-3">
                                    <PasswordInput
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Mật khẩu hiện tại"
                                    />
                                    <PasswordInput
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Mật khẩu mới"
                                    />
                                    <PasswordInput
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Xác nhận mật khẩu mới"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleChangePassword}
                                            disabled={savingPassword}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <FaSave /> {savingPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingPassword(false);
                                                setCurrentPassword('');
                                                setNewPassword('');
                                                setConfirmPassword('');
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                        >
                                            <FaTimes /> Hủy
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-900 dark:text-white font-medium">••••••••</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 md:p-8">
                    <h2 className="text-2xl font-mono font-bold text-gray-900 dark:text-white mb-6">Lịch sử làm bài</h2>

                    {stats.recentSessions.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">Chưa có hoạt động nào</p>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg custom-thin-scrollbar">
                                <table className="w-full">
                                    <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                                        <tr className="border-b border-gray-200 dark:border-gray-700">
                                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Quiz</th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Điểm</th>
                                            <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Tỷ lệ</th>
                                            <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Thời gian</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.recentSessions.map((session) => (
                                            <tr key={session.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                <td className="py-4 px-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">{session.className}</span>
                                                        <span className="text-gray-900 dark:text-white font-medium">{session.quizTitle}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-center text-gray-900 dark:text-white">
                                                    {session.score}/{session.totalQuestions}
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${session.percentage >= 80
                                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                        : session.percentage >= 50
                                                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                        }`}>
                                                        {session.percentage}%
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right text-sm text-gray-600 dark:text-gray-400">
                                                    {formatDateTime(session.completedAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-4 max-h-[500px] overflow-y-auto custom-thin-scrollbar">
                                {stats.recentSessions.map((session) => (
                                    <div key={session.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{session.className}</span>
                                            <h3 className="font-medium text-gray-900 dark:text-white">{session.quizTitle}</h3>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600 dark:text-gray-400">Điểm:</span>
                                            <span className="text-gray-900 dark:text-white font-medium">
                                                {session.score}/{session.totalQuestions}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600 dark:text-gray-400">Tỷ lệ:</span>
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${session.percentage >= 80
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                : session.percentage >= 50
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                }`}>
                                                {session.percentage}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                                            {formatDateTime(session.completedAt)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
