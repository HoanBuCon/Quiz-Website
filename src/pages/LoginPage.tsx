import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiRequest } from "../utils/api";
// setToken is no longer needed - cookie-based auth

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return setErrors({ email: "Vui lòng nhập email" });
    if (!formData.password)
      return setErrors({ password: "Vui lòng nhập mật khẩu" });

    setLoading(true);
    try {
      const normalizedData = {
        ...formData,
        email: formData.email.toLowerCase().trim(),
      };
      const response = await apiRequest<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(normalizedData),
      });
      // Cookie is automatically set by server via Set-Cookie header
      // No need to call setToken() anymore
      toast.success("Đăng nhập thành công!");
      navigate("/classes");
    } catch (err: any) {
      toast.error(err.message || "Sai thông tin đăng nhập.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 px-4">
      <div className="w-full max-w-md bg-white/90 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-8">
          <img src="/Trollface.png" alt="Logo" className="h-12 w-12 mb-3" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Đăng nhập
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            hoặc{" "}
            <Link
              to="/register"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              tạo tài khoản mới
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="your_email@email.com"
            />
            {errors.email && (
              <p className="text-sm text-red-500 mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.password ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="your_password"
            />
            {errors.password && (
              <p className="text-sm text-red-500 mt-1">{errors.password}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <Link
              to="/forgot-password"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Quên mật khẩu?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-4 rounded-xl text-white font-medium bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-800 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <div className="text-center mt-4">
            <Link
              to="/"
              className="text-sm text-gray-600 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
            >
              ← Quay lại trang chủ
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
