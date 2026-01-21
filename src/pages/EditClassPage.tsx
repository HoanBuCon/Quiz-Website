import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ClassRoom } from "../types";
import {
  FaSave,
  FaTimes,
  FaShareAlt,
  FaCopy,
  FaUserShield,
  FaHistory,
  FaEdit,
  FaChalkboardTeacher,
  FaGlobe,
  FaLock,
  FaBan,
  FaCheck,
  FaExclamationTriangle,
  FaArrowLeft,
  FaUsers
} from "react-icons/fa";
import { toast } from "react-hot-toast";

const EditClassPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const stateClass: ClassRoom | undefined = (location.state as any)?.classRoom;

  const [loading, setLoading] = useState(!stateClass);
  const [name, setName] = useState(stateClass?.name || "");
  const [description, setDescription] = useState(stateClass?.description || "");
  const [saving, setSaving] = useState(false);

  const [shareData, setShareData] = useState<{ isShareable: boolean; code?: string } | null>(null);
  const [loadingShare, setLoadingShare] = useState(true);

  const [quizzes, setQuizzes] = useState<any[]>([]);

  // If classRoom not provided via state, fetch from backend (mine)
  useEffect(() => {
    if (!classId) return;
    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          toast.error("Vui lòng đăng nhập");
          navigate("/");
          return;
        }
        const { ClassesAPI, VisibilityAPI, QuizzesAPI } = await import("../utils/api");

        // Fetch class info
        if (!stateClass) {
          const mine = await ClassesAPI.listMine(token);
          const found = mine.find((c: any) => c.id === classId);
          if (!found) {
            toast.error("Không tìm thấy lớp học!");
            navigate(-1);
            return;
          }
          setName(found.name || "");
          setDescription(found.description || "");
        }

        // Fetch quizzes
        const qzs = await QuizzesAPI.byClass(classId, token);
        setQuizzes(qzs);

        // Fetch share status
        const shareStatus = await VisibilityAPI.getShareStatus('class', classId, token);
        setShareData(shareStatus);

      } catch (e) {
        console.error(e);
        toast.error("Không thể tải thông tin lớp học");
      } finally {
        setLoading(false);
        setLoadingShare(false);
      }
    })();
  }, [stateClass, classId, navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên lớp học");
      return;
    }
    setSaving(true);
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { ClassesAPI } = await import("../utils/api");
      await ClassesAPI.update(classId!, { name, description }, token);
      toast.success("Đã cập nhật lớp học thành công!");
      // navigate(-1); // Optional: stay on page to continue editing
    } catch (e) {
      toast.error("Có lỗi xảy ra khi lưu.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleShare = async () => {
    if (!shareData) return;
    const newState = !shareData.isShareable;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");

      await VisibilityAPI.shareToggle({
        targetType: 'class',
        targetId: classId!,
        enabled: newState
      }, token);

      // Refresh status to get code if enabled
      const status = await VisibilityAPI.getShareStatus('class', classId!, token);
      setShareData(status);
      toast.success(newState ? "Đã bật chia sẻ lớp học" : "Đã tắt chia sẻ lớp học");
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái chia sẻ");
    }
  };

  const handleResetCode = async () => {
    if (!window.confirm("CẢNH BÁO: Reset code sẽ làm code cũ bị vô hiệu hóa. Người dùng cũ sẽ không thể truy cập bằng link cũ. Bạn có chắc chắn?")) return;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");

      const res = await VisibilityAPI.resetShareCode({
        targetType: 'class',
        targetId: classId!
      }, token);

      setShareData(prev => prev ? ({ ...prev, code: res.code }) : null);
      toast.success("Đã reset code thành công!");
    } catch (e) {
      toast.error("Lỗi khi reset code");
    }
  };

  if (loading) {
    const SpinnerLoading = require("../components/SpinnerLoading").default;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div style={{ transform: 'scale(0.8)' }}>
          <SpinnerLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Quay lại"
          >
            <FaArrowLeft className="text-gray-600 dark:text-gray-400 text-lg" />
          </button>
          <span>Chỉnh sửa lớp học: <span className="text-blue-600 dark:text-blue-400">{name}</span></span>
        </h1>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-70 disabled:pointer-events-none"
        >
          {saving ? (
            <>Running...</>
          ) : (
            <>
              <FaSave className="text-lg" /> Lưu thay đổi
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">

        {/* LEFT COLUMN: General Info & Class Access */}
        <div className="space-y-6">
          {/* Card 1: General Info */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <FaChalkboardTeacher className="text-blue-500" />
                Thông tin chung
              </h3>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tên lớp học <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none font-medium"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  placeholder="Nhập tên lớp học..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Mô tả
                </label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all outline-none resize-y min-h-[100px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={saving}
                  placeholder="Mô tả về lớp học này..."
                />
              </div>
            </div>
          </div>

          {/* Card 2: Access Control */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <FaUserShield className="text-purple-500" />
                Quản lý quyền truy cập
              </h3>

              {/* Simple Toggle Switch */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <span className={`text-sm font-medium transition-colors ${shareData?.isShareable ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                  {shareData?.isShareable ? 'Đang bật' : 'Đang tắt'}
                </span>
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={shareData?.isShareable || false} onChange={handleToggleShare} disabled={loadingShare} />
                  <div className={`block w-12 h-7 rounded-full transition-colors duration-300 ${shareData?.isShareable ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${shareData?.isShareable ? 'transform translate-x-5' : ''}`}></div>
                </div>
              </label>
            </div>

            <div className="p-6">
              {/* Share Code Section */}
              <div className={`transition-all duration-500 ease-in-out overflow-hidden ${shareData?.isShareable ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-5 border border-blue-100 dark:border-blue-800/30 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider mb-2">
                      Access ID
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mb-3 block">
                      Mã tham gia lớp học
                    </p>
                    <div className="flex items-center gap-3 w-full">
                      <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 rounded-lg text-xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-wider select-all text-center">
                        {shareData?.code || "WAITING..."}
                      </code>
                      <button
                        onClick={() => {
                          if (shareData?.code) {
                            navigator.clipboard.writeText(shareData.code);
                            toast.success("Đã copy ID!");
                          }
                        }}
                        className="p-3 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/50 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-lg transition-colors"
                        title="Copy ID"
                      >
                        <FaCopy />
                      </button>
                    </div>
                  </div>

                  <div className="flex-shrink-0 self-start sm:self-center mt-2 sm:mt-0">
                    <button
                      onClick={handleResetCode}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium transition-all shadow-sm"
                    >
                      <FaHistory /> Reset ID
                    </button>
                  </div>
                </div>

                {/* User List Info */}
                <div className="mb-4">
                  <h4 className="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                    <FaUsers className="text-gray-500" />
                    Danh sách thành viên
                  </h4>
                  <UserAccessList classId={classId!} />
                </div>
              </div>

              {!shareData?.isShareable && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                  <FaLock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Bật tính năng chia sẻ để quản lý mã truy cập và thành viên.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Quiz Access */}
        <div className="space-y-6">
          {/* Card 3: Quiz Access Control */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden h-full">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <FaGlobe className="text-green-500" />
                Quản lý truy cập Quiz
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                Cấu hình quyền truy cập riêng lẻ cho từng bài kiểm tra
              </p>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                {quizzes.map(q => {
                  return (
                    <QuizAccessCard
                      key={q.id}
                      quiz={q}
                      onUpdate={() => { }}
                    />
                  );
                })}
                {quizzes.length === 0 && (
                  <div className="text-center py-10 text-gray-500">
                    Chưa có bài kiểm tra nào trong lớp học này.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// HELPER COMPONENTS (Styled)
// ----------------------------------------------------------------------

const QuizAccessCard: React.FC<{ quiz: any; onUpdate: () => void }> = ({ quiz, onUpdate }) => {
  const [shareData, setShareData] = useState<{ isShareable: boolean; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Local token fetch
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { getToken } = await import("../utils/auth");
      setToken(getToken());
    })();
  }, [])

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { VisibilityAPI } = await import("../utils/api");
        const status = await VisibilityAPI.getShareStatus('quiz', quiz.id, token);
        setShareData(status);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [quiz.id, token]);

  const handleToggleShare = async () => {
    if (!shareData || !token) return;
    const newState = !shareData.isShareable;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.shareToggle({
        targetType: 'quiz',
        targetId: quiz.id,
        enabled: newState
      }, token);

      const status = await VisibilityAPI.getShareStatus('quiz', quiz.id, token);
      setShareData(status);
      toast.success(newState ? `Đã bật ID cho quiz: ${quiz.title}` : `Đã tắt ID cho quiz: ${quiz.title}`);
    } catch (e) {
      toast.error("Không thể thay đổi trạng thái chia sẻ quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleResetCode = async () => {
    if (!token) return;
    if (!window.confirm(`Reset Access ID cho quiz "${quiz.title}"? ID cũ sẽ bị hủy.`)) return;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      const res = await VisibilityAPI.resetShareCode({ targetType: 'quiz', targetId: quiz.id }, token);
      setShareData(prev => prev ? ({ ...prev, code: res.code }) : null);
      toast.success("Đã reset Quiz Access ID!");
    } catch (e) {
      toast.error("Lỗi khi reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`
       rounded-xl border transition-all duration-300
       ${expanded
        ? 'bg-white dark:bg-gray-800 border-blue-500 ring-1 ring-blue-500 shadow-md'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
      }
    `}>
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${quiz.published ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {quiz.published ? <FaCheck /> : <FaLock />}
          </div>
          <div>
            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-base">{quiz.title}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {quiz.questionCount ?? 0} câu hỏi • {quiz.published ? "Public ✅" : "Private 🔒"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {shareData?.isShareable && (
            <span className="hidden sm:inline-block px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 text-xs font-bold rounded-md uppercase tracking-wider">
              Shared
            </span>
          )}
          <button className={`text-sm font-medium transition-colors ${expanded ? 'text-blue-600' : 'text-gray-400'}`}>
            {expanded ? 'Thu gọn' : 'Cấu hình'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div className="h-px w-full bg-gray-100 dark:bg-gray-700 mb-4"></div>

          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={shareData?.isShareable || false} onChange={handleToggleShare} disabled={loading} />
                  <div className={`block w-10 h-6 rounded-full transition-colors ${shareData?.isShareable ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-600'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${shareData?.isShareable ? 'transform translate-x-4' : ''}`}></div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cho phép truy cập riêng qua Quiz ID</span>
              </label>

              {shareData?.isShareable && shareData.code && (
                <div className="flex items-center gap-2 mt-2">
                  <code className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 font-mono text-sm text-purple-600 dark:text-purple-400 font-bold">
                    {shareData.code}
                  </code>
                  <button onClick={() => { navigator.clipboard.writeText(shareData.code!); toast.success("Copied!") }} className="text-gray-400 hover:text-gray-600">
                    <FaCopy />
                  </button>
                  <button onClick={handleResetCode} disabled={loading} className="text-xs text-red-500 hover:text-red-600 underline ml-2">
                    Reset ID
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-dashed border-gray-200 dark:border-gray-700 pt-4 sm:pt-0 sm:pl-6">
              {shareData?.isShareable ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase">Danh sách truy cập Quiz</p>
                  <UserAccessList classId={quiz.id} targetType="quiz" />
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Bật chia sẻ để xem danh sách quyền truy cập cho Quiz này.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const UserAccessList: React.FC<{ classId: string; targetType?: 'class' | 'quiz' }> = ({ classId, targetType = 'class' }) => {
  const [users, setUsers] = useState<{ active: any[]; banned: any[] }>({ active: [], banned: [] });
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { getToken } = await import("../utils/auth");
      setToken(getToken());
    })();
  }, []);

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      const data = await VisibilityAPI.getAccessUsers(targetType, classId, token);
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [classId, targetType, token]);

  const handleBan = async (userId: string) => {
    if (!token) return;
    if (!window.confirm("Bạn có chắc muốn chặn người dùng này?")) return;
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.banUser({ targetType, targetId: classId, userId }, token);
      toast.success("Đã chặn người dùng");
      fetchUsers();
    } catch (e) {
      toast.error("Lỗi khi ban user");
    }
  };

  const handleUnban = async (userId: string) => {
    if (!token) return;
    if (!window.confirm("Bỏ chặn người dùng này?")) return;
    try {
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.unbanUser({ targetType, targetId: classId, userId }, token);
      toast.success("Đã bỏ chặn");
      fetchUsers();
    } catch (e) {
      toast.error("Lỗi khi unban user");
    }
  };

  return (
    <div className="space-y-5">
      {/* Active Users */}
      <div>
        <h4 className="font-semibold text-xs mb-3 text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Active Users ({users.active.length})
        </h4>

        {loading && users.active.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-2">Loading...</div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {users.active.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-400 italic">Chưa có người dùng nào truy cập.</div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2">User</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {users.active.map(u => (
                      <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <img
                              src={u.avatarUrl || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                              alt=""
                              className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png";
                              }}
                            />
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm">{u.name}</div>
                              <div className="text-xs text-gray-500">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleBan(u.userId)}
                            className="text-white bg-red-400 hover:bg-red-500 p-1.5 rounded-md transition-colors text-xs"
                            title="Ban User"
                          >
                            <FaBan />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Banned Users */}
      {users.banned.length > 0 && (
        <div className="animate-fadeIn">
          <h4 className="font-semibold text-xs mb-3 text-red-500 dark:text-red-400 uppercase tracking-wider flex items-center gap-2">
            <FaExclamationTriangle />
            Banned Users ({users.banned.length})
          </h4>
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl overflow-hidden">
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-red-100 dark:divide-red-900/30">
                  {users.banned.map(u => (
                    <tr key={u.userId} className="hover:bg-red-100/50 dark:hover:bg-red-900/20 transition-colors">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-red-900 dark:text-red-200 text-sm">{u.name}</span>
                          {u.source === 'class' && (
                            <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold border border-red-300">
                              CLASS BAN
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleUnban(u.userId)}
                          // logic: if targetType is 'quiz' but user is banned by 'class', we can't unban here easily?
                          // Logic from previous code: "disabled={u.source === 'class'}"
                          // Wait, if I am in Quiz Access View, and user is banned from Class, they shouldn't even appear as "Active" in quiz?
                          // They appear in "Banned" list of Quiz?
                          // If they are banned from Class, they are banned from ALL quizzes.
                          // If I am managing Quiz Access, I probably can't unban a Class-level ban.
                          disabled={targetType === 'quiz' && u.source === 'class'}
                          className={`text-xs font-semibold px-2 py-1 rounded border ${targetType === 'quiz' && u.source === 'class'
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-white text-green-600 border-green-200 hover:bg-green-50'
                            }`}
                        >
                          Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditClassPage;
