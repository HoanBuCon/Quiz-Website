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

  // If classRoom not provided via state, fetch from backend (mine)
  useEffect(() => {
    if (stateClass || !classId) return;
    (async () => {
      try {
        const { getToken } = await import("../utils/auth");
        const token = getToken();
        if (!token) {
          alert("Vui lòng đăng nhập");
          navigate("/");
          return;
        }
        const { ClassesAPI, QuizzesAPI } = await import("../utils/api");
        const mine = await ClassesAPI.listMine(token);
        const found = mine.find((c: any) => c.id === classId);
        if (!found) {
          alert("Không tìm thấy lớp học!");
          navigate(-1);
          return;
        }
        setName(found.name || "");
        setDescription(found.description || "");
      } catch (e) {
        alert("Không thể tải lớp học!");
        navigate(-1);
      } finally {
        setLoading(false);
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
      if (!token) {
        alert("Vui lòng đăng nhập");
        return;
      }
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

export default EditClassPage;
