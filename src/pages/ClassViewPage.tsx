import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { QuizzesAPI, ClassesAPI } from "../utils/api";
import { buildShortId } from "../utils/share";
import { Quiz } from "../types";
import { getToken } from "../utils/auth";

const ClassViewPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Lớp học");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token || !classId) {
          setLoading(false);
          return;
        }
        // fetch class by id or by short code
        const mine = await ClassesAPI.listMine(token).catch(() => []);
        const pub = await ClassesAPI.listPublic(token).catch(() => []);
        const all = [...mine, ...pub];
        const cls = all.find(
          (c: any) => c.id === classId || buildShortId(c.id) === classId
        );
        if (cls) setTitle(cls.name);
        const effectiveClassId = cls ? cls.id : classId;
        const qzs = await QuizzesAPI.byClass(effectiveClassId, token);
        const ownerIds = new Set(
          mine
            .filter((m: any) => m.accessType === "owner")
            .map((m: any) => m.id)
        );
        const owner = ownerIds.has(effectiveClassId);
        setIsOwner(owner);
        const visible = owner ? qzs : qzs.filter((q: any) => q.published);
        setQuizzes(visible);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

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
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        {title}
      </h1>
      {quizzes.length === 0 ? (
        <div className="card p-6 text-center">Không có bài kiểm tra nào.</div>
      ) : (
        <div className="space-y-3">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="card p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {q.title}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {q.description}
                </div>
                {!isOwner && !(q as any).published && (
                  <div className="text-xs text-amber-600 mt-1">
                    Riêng tư (chỉ chủ sở hữu xem được)
                  </div>
                )}
              </div>
              <button
                onClick={() =>
                  navigate(`/quiz/${q.id}`, { state: { className: title } })
                }
                className="btn-secondary"
              >
                Làm bài
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6">
        <Link to="/" className="text-sm text-gray-600 dark:text-gray-400">
          ← Trang chủ
        </Link>
      </div>
    </div>
  );
};

export default ClassViewPage;
