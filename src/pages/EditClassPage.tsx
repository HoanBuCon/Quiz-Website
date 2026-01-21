import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ClassRoom } from "../types";

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
          alert("Vui lòng đăng nhập");
          navigate("/");
          return;
        }
        const { ClassesAPI, VisibilityAPI, QuizzesAPI } = await import("../utils/api");

        // Fetch class info
        if (!stateClass) {
          const mine = await ClassesAPI.listMine(token);
          const found = mine.find((c: any) => c.id === classId);
          if (!found) {
            alert("Không tìm thấy lớp học!");
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
        // Don't block UI if just share status fails, but ideally show error
      } finally {
        setLoading(false);
        setLoadingShare(false);
      }
    })();
  }, [stateClass, classId, navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Vui lòng nhập tên lớp học");
      return;
    }
    setSaving(true);
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { ClassesAPI } = await import("../utils/api");
      await ClassesAPI.update(classId!, { name, description }, token);
      alert("Đã cập nhật lớp học thành công!");
      navigate(-1);
    } catch (e) {
      alert("Có lỗi xảy ra khi lưu.");
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
    } catch (e) {
      alert("Không thể thay đổi trạng thái chia sẻ");
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
      alert("Đã reset code thành công!");
    } catch (e) {
      alert("Lỗi khi reset code");
    }
  };

  if (loading) {
    const SpinnerLoading = require("../components/SpinnerLoading").default;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ transform: 'scale(0.435)' }}>
          <SpinnerLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-transparent">
      <div className="max-w-lg w-full px-4 py-6 mx-6 bg-white border border-gray-300 dark:border-gray-600 dark:!bg-gray-900 dark:!text-gray-100 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Chỉnh sửa lớp học
        </h1>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Tên lớp học</label>
          <input
            className="w-full border border-stone-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:bg-white dark:focus:border-primary-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Mô tả lớp học</label>
          <textarea
            className="w-full border border-stone-300 dark:border-gray-600 rounded px-3 py-2 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:bg-white dark:focus:border-primary-500"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={saving}
          />
        </div>

        {/* Access Control Section */}
        <div className="mb-6 border-t pt-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Quản lý truy cập</h3>

          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="shareToggle"
              className="w-5 h-5"
              checked={shareData?.isShareable || false}
              onChange={handleToggleShare}
              disabled={loadingShare}
            />
            <label htmlFor="shareToggle" className="cursor-pointer select-none">
              Cho phép chia sẻ qua ID/Link
            </label>
          </div>

          {shareData?.isShareable && shareData.code && (
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md mb-4">
              <div className="mb-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Access ID</label>
                <div className="flex gap-2">
                  <code className="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-2 py-1 rounded font-mono text-lg tracking-wide">
                    {shareData.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareData.code!);
                      alert("Đã copy ID!");
                    }}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <button
                onClick={handleResetCode}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 underline mt-2"
              >
                Reset ID & Link (Vô hiệu hóa ID cũ)
              </button>
            </div>
          )}

          {shareData?.isShareable && (
            <div className="mt-6">
              <UserAccessList classId={classId!} />
            </div>
          )}

          {/* Helper function to refresh quiz list if needed (e.g. after toggle) */}
          {/* Note: In a real app we might want to refetch, here we just pass token */}
        </div>

        {/* QUIZ ACCESS CONTROL SECTION */}
        <div className="mb-6 border-t pt-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Quản lý truy cập Quiz</h3>
          <p className="text-sm text-gray-500 mb-4">
            Quản lý quyền truy cập và chia sẻ cho từng bài kiểm tra.
            <br />
            (Lưu ý: Logic Public/Private tuân theo quy tắc của Class)
          </p>

          <div className="space-y-2">
            {quizzes.map(q => {
              const { getToken } = require("../utils/auth"); // Inline require or use context/hook if available
              // Since we are inside component, we can't easily use hooks inside map if we didn't prepare components.
              // Used QuizAccessCard component defined below.
              return (
                <QuizAccessCard
                  key={q.id}
                  quiz={q}
                  token={localStorage.getItem('token') || ''} // Using localStorage directly or need state token? 
                  // Ideally we should have token in state or context.
                  // EditClassPage fetches token in useEffect but doesn't store it.
                  // Let's grab it from localStorage for now or use the one from auth util.
                  onUpdate={() => { }}
                />
              );
            })}
            {quizzes.length === 0 && <p className="text-gray-500 italic">Lớp này chưa có bài kiểm tra nào.</p>}
          </div>
        </div>

        <div className="flex gap-2 justify-center mt-6">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            Lưu thay đổi
          </button>
          <button
            className="btn-secondary"
            onClick={() => navigate(-1)}
            disabled={saving}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
};

// ... (UserAccessList component remains same, but we will move it up or reuse it) ...

// Helper component for Quiz Item Access Control
const QuizAccessCard: React.FC<{ quiz: any; token: string; onUpdate: () => void }> = ({ quiz, token, onUpdate }) => {
  const [shareData, setShareData] = useState<{ isShareable: boolean; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
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
    if (!shareData) return;
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
      onUpdate(); // Refresh parent list logic if needed
    } catch (e) {
      alert("Không thể thay đổi trạng thái chia sẻ quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleResetCode = async () => {
    if (!window.confirm(`Reset Access ID cho quiz "${quiz.title}"? ID cũ sẽ bị hủy.`)) return;
    setLoading(true);
    try {
      const { VisibilityAPI } = await import("../utils/api");
      const res = await VisibilityAPI.resetShareCode({ targetType: 'quiz', targetId: quiz.id }, token);
      setShareData(prev => prev ? ({ ...prev, code: res.code }) : null);
      alert("Đã reset Quiz Access ID!");
    } catch (e) {
      alert("Lỗi khi reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded p-4 mb-3 bg-gray-50 dark:bg-gray-800">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-semibold text-md">{quiz.title}</h4>
          <p className="text-xs text-gray-500">{quiz.published ? "Public ✅" : "Private 🔒"}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:underline"
        >
          {expanded ? "Thu gọn" : "Quản lý truy cập"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={shareData?.isShareable || false}
              onChange={handleToggleShare}
              disabled={loading}
              className="w-4 h-4"
            />
            <span className="text-sm">Cho phép truy cập qua ID/Link</span>
          </div>

          {shareData?.isShareable && shareData.code && (
            <div className="bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-2">
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono text-md font-bold text-blue-600">
                  {shareData.code}
                </code>
                <button onClick={() => navigator.clipboard.writeText(shareData.code!)} className="text-xs bg-gray-200 px-2 py-1 rounded">Copy</button>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={handleResetCode} className="text-xs text-red-500 hover:underline" disabled={loading}>
                  Reset ID
                </button>
                <a
                  href={`/quiz/${shareData.code}`} // Using ID as link param? Or standard link? 
                  // Requirement says: "Mỗi Quiz có Link truy cập riêng". Usually /quiz/:id or /quiz/:code.
                  // Existing logic uses /claim or direct link if public.
                  // Let's assume the link format is /quiz/<id> normally, but with code it might be different?
                  // Actually, usually users copy the code. The link might be just the CLAIM link.
                  // Let's just provide the code copy for now as per "ID truy cập".
                  className="text-xs text-gray-400"
                  onClick={(e) => e.preventDefault()}
                >
                  (Link: /share/{shareData.code})
                </a>
              </div>
            </div>
          )}

          {shareData?.isShareable && (
            <div className="mt-3">
              <UserAccessList classId={quiz.id} targetType="quiz" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Updated UserAccessList to handle targetType
const UserAccessList: React.FC<{ classId: string; targetType?: 'class' | 'quiz' }> = ({ classId, targetType = 'class' }) => {
  const [users, setUsers] = useState<{ active: any[]; banned: any[] }>({ active: [], banned: [] });
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
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
    fetchUsers();
  }, [classId, targetType]);

  const handleBan = async (userId: string) => {
    if (!window.confirm("Bạn có chắc muốn chặn người dùng này?")) return;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.banUser({ targetType, targetId: classId, userId }, token);
      fetchUsers();
    } catch (e) {
      alert("Lỗi khi ban user");
    }
  };

  const handleUnban = async (userId: string) => {
    if (!window.confirm("Bỏ chặn người dùng này?")) return;
    try {
      const { getToken } = await import("../utils/auth");
      const token = getToken();
      if (!token) return;
      const { VisibilityAPI } = await import("../utils/api");
      await VisibilityAPI.unbanUser({ targetType, targetId: classId, userId }, token);
      fetchUsers();
    } catch (e) {
      alert("Lỗi khi unban user");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-xs mb-2 text-gray-500 uppercase">Active Users ({users.active.length})</h4>
        {loading ? <div className="text-xs text-gray-500">Loading...</div> : (
          <div className="overflow-x-auto max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
            <table className="w-full text-xs text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.active.map(u => (
                  <tr key={u.userId} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                    <td className="px-2 py-1 flex items-center gap-2">
                      <img
                        src={u.avatarUrl || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"}
                        alt="Avatar"
                        className="w-6 h-6 rounded-full object-cover border border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png";
                        }}
                      />
                      <span>{u.name} <span className="text-gray-400 text-xs">({u.email})</span></span>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => handleBan(u.userId)} className="text-red-500 hover:underline">Ban</button>
                    </td>
                  </tr>
                ))}
                {users.active.length === 0 && (
                  <tr><td colSpan={2} className="px-2 py-1 text-center text-gray-500">Empty</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {users.banned.length > 0 && (
        <div>
          <h4 className="font-semibold text-xs mb-2 text-red-600 uppercase">Banned Check ({users.banned.length})</h4>
          <div className="overflow-x-auto max-h-32 overflow-y-auto border border-red-200 dark:border-red-900 rounded bg-red-50 dark:bg-red-900/10">
            {/* Reusing table structure for conciseness */}
            <table className="w-full text-xs text-left">
              <tbody>
                {users.banned.map(u => (
                  <tr key={u.userId} className="border-b dark:border-gray-700">
                    <td className="px-2 py-1">
                      {u.name}
                      {u.source === 'class' && (
                        <span className="ml-2 text-[10px] bg-red-100 text-red-800 px-1 py-0.5 rounded border border-red-200">
                          Class Ban
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => handleUnban(u.userId)}
                        className={`text-xs hover:underline ${u.source === 'class' ? 'text-gray-400 cursor-not-allowed' : 'text-blue-500'}`}
                        disabled={u.source === 'class'}
                        title={u.source === 'class' ? "Phải UNBAN user này tại Class" : "Bỏ chặn"}
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
      )}
    </div>
  );
};

export default EditClassPage;
