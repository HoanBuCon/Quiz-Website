import React, { useEffect, useState } from 'react';
import { ActivityCalendar } from 'react-activity-calendar';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../utils/api';
import { getToken } from '../utils/auth';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';

interface ActivityData {
    date: string;
    count: number;
    level: number;
}

interface ContributionGraphProps {
    showLabel?: boolean;
    blockSize?: number;
    maxHeight?: string;
    isBanner?: boolean; // New prop for high-contrast mode
    scrollbarClass?: string; // New prop for custom scrollbar styling
    selectedYear?: number;
    onYearChange?: (year: number) => void;
}

export const ContributionGraph = ({
    blockSize = 12,
    showLabel = true,
    selectedYear: externalYear,
    onYearChange,
    maxHeight,
    isBanner,
    scrollbarClass = "custom-scrollbar" // Default to existing style
}: ContributionGraphProps) => {
    const [activityData, setActivityData] = useState<ActivityData[]>([]);
    const [loading, setLoading] = useState(true);
    const [internalYear, setInternalYear] = useState(new Date().getFullYear());
    const { isDarkMode } = useTheme();
    const API_URL = getApiBaseUrl();

    const labelColor = isBanner ? '#f8fafc' : (isDarkMode ? '#9ca3af' : '#4b5563');
    const footerTextColor = isBanner ? 'text-blue-50/90' : 'text-gray-500 dark:text-gray-400';
    const subLabelColor = isBanner ? 'text-blue-100/70' : 'text-xs text-gray-400';



    // Use external year if provided, otherwise use internal
    const selectedYear = externalYear || internalYear;

    const handleYearChange = (year: number) => {
        setInternalYear(year);
        if (onYearChange) {
            onYearChange(year);
        }
    };

    useEffect(() => {
        const fetchActivityData = async () => {
            try {
                setLoading(true);
                const token = getToken();
                if (!token) return;

                const response = await fetch(`${API_URL}/profile/activity?year=${selectedYear}`, {
                    credentials: 'include', // ✅ Cookie-based authentication
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setActivityData(data);
                }
            } catch (error) {
                console.error('Error fetching activity data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchActivityData();
    }, [API_URL, selectedYear]);

    // Theme configuration  
    const theme = {
        light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
        dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    };

    const explicitTheme = {
        light: theme.light,
        dark: theme.dark,
    };

    if (loading) {
        return (
            <div className="w-full h-32 flex items-center justify-center">
                <div className="animate-pulse text-gray-400 dark:text-gray-600">
                    Đang tải...
                </div>
            </div>
        );
    }

    if (activityData.length === 0) {
        return (
            <div className="w-full h-[156px] flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                    Chưa có hoạt động nào trong năm {selectedYear}
                </p>
            </div>
        );
    }

    // Calculate total contributions manually
    const totalCountValue = activityData.reduce((sum, day) => sum + day.count, 0);


    return (
        <div className="w-fit max-w-full">
            {/* Graph only - scrollable container */}
            <div
                className={`w-full overflow-x-auto ${scrollbarClass}`}
                style={{ maxHeight: maxHeight || 'auto' }}
            >
                <div className="min-w-max contribution-calendar-wrapper">
                    <ActivityCalendar
                        data={activityData}
                        theme={explicitTheme}
                        colorScheme={isDarkMode ? 'dark' : 'light'}
                        blockSize={blockSize}
                        blockMargin={4}
                        fontSize={12}
                        showTotalCount={false}
                        showColorLegend={false}
                        labels={{
                            months: [
                                'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
                            ],
                            weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                        }}
                        renderBlock={(block, activity) =>
                            React.cloneElement(block, {
                                'data-tooltip-id': 'activity-tooltip',
                                'data-tooltip-content': activity.count > 0
                                    ? `${activity.count} bài kiểm tra đã hoàn thành vào ${new Date(activity.date).toLocaleDateString('vi-VN', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}`
                                    : `Không có hoạt động vào ${new Date(activity.date).toLocaleDateString('vi-VN', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}`,
                                strokeWidth: 0, // Remove block borders
                                rx: 2, // Slight rounding for premium feel if not already there
                                ry: 2,
                            } as any)
                        }
                        showWeekdayLabels
                        style={{
                            color: labelColor,
                        }}
                    />
                </div>
            </div>

            {/* Stationary Footer Section */}
            {(showLabel || true) && (
                <div className={`mt-3 flex flex-wrap items-center justify-between gap-4 text-[13px] ${footerTextColor} font-medium xl:px-[32px] lg:px-[28px]`}>
                    <div className="activity-summary flex items-center gap-1.5">
                        <span className={`${isBanner ? 'text-white' : 'text-blue-500'} font-bold`}>{totalCountValue}</span>
                        <span>bài kiểm tra đã hoàn thành trong năm {selectedYear}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className={subLabelColor}>Ít</span>
                            <div className="flex gap-1">
                                {(isDarkMode ? theme.dark : theme.light).map((color, i) => (
                                    <div
                                        key={i}
                                        className="w-3 h-3 rounded-sm"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <span className={subLabelColor}>Nhiều</span>
                        </div>
                    </div>
                </div>
            )}
            <Tooltip id="activity-tooltip" />
        </div>
    );
};

// Separate YearSelector component for external use
export const YearSelector: React.FC<{
    selectedYear: number;
    onYearChange: (year: number) => void;
    minYear?: number;
}> = ({ selectedYear, onYearChange, minYear = 2025 }) => {
    // Generate available years (from 2025 to current year)
    const currentYear = new Date().getFullYear();
    const availableYears = Array.from(
        { length: currentYear - minYear + 1 },
        (_, i) => currentYear - i
    );

    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="w-full xl:w-auto xl:min-w-[80px]" ref={dropdownRef}>
            {/* Mobile Dropdown - "Small and cute" style */}
            <div className="block xl:hidden relative">
                <div className="flex justify-end">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800  rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-gray-700 dark:text-gray-200"
                    >
                        <span>Năm {selectedYear}</span>
                        <svg
                            className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>

                {/* Dropdown Menu */}
                {isOpen && (
                    <div className="absolute right-0 top-full mt-2 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden animate-fadeIn">
                        <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                            {availableYears.map((year) => (
                                <button
                                    key={year}
                                    onClick={() => {
                                        onYearChange(year);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-center px-3 py-2 rounded-lg text-sm transition-colors ${selectedYear === year
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                        }`}
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop Vertical List */}
            <div className="hidden xl:flex flex-col gap-2 h-[156px] overflow-y-auto custom-scrollbar pr-2">
                {availableYears.map((year) => (
                    <button
                        key={year}
                        onClick={() => onYearChange(year)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all w-full text-center ${selectedYear === year
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                    >
                        {year}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ContributionGraph;
