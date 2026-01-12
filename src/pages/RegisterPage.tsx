import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiRequest } from "../utils/api";
// setToken is no longer needed - cookie-based auth

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: any = {};
    if (!formData.name.trim()) newErrors.name = "Vui lòng nhập họ tên";
    if (!formData.email.trim()) newErrors.email = "Vui lòng nhập email";
    if (!formData.password) newErrors.password = "Vui lòng nhập mật khẩu";
    if (formData.password.length < 6)
      newErrors.password = "Mật khẩu phải có ít nhất 6 ký tự";
    if (formData.confirmPassword !== formData.password)
      newErrors.confirmPassword = "Mật khẩu xác nhận không khớp";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const { confirmPassword, ...registerData } = formData;
      const normalizedData = {
        ...registerData,
        email: registerData.email.toLowerCase().trim(),
      };
      const response = await apiRequest<{ token: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(normalizedData),
      });
      // Cookie is automatically set by server via Set-Cookie header
      // No need to call setToken() anymore
      toast.success("Đăng ký thành công!");
      navigate("/classes");
    } catch (err: any) {
      toast.error(err.message || "Đăng ký thất bại, vui lòng thử lại.");
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
            Tạo tài khoản mới
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            hoặc{" "}
            <Link
              to="/login"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              đăng nhập tài khoản hiện có
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Họ tên */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Họ tên
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              placeholder="Username"
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.name ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Email */}
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
              onChange={handleChange}
              placeholder="your_email@email.com"
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.email && (
              <p className="text-sm text-red-500 mt-1">{errors.email}</p>
            )}
          </div>

          {/* Mật khẩu */}
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
              onChange={handleChange}
              placeholder="your_password"
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.password ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.password && (
              <p className="text-sm text-red-500 mt-1">{errors.password}</p>
            )}
          </div>

          {/* Xác nhận mật khẩu */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Xác nhận mật khẩu
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="your_password"
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 bg-transparent shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:border-gray-600 ${errors.confirmPassword ? "border-red-500" : "border-gray-300"
                }`}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-500 mt-1">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Nút submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-4 rounded-xl text-white font-medium bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:ring-primary-300 dark:focus:ring-primary-800 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
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

export default RegisterPage;
