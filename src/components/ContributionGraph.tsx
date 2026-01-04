import React, { useEffect, useState } from 'react';
import { ActivityCalendar } from 'react-activity-calendar';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../utils/api';
import { getToken } from '../utils/auth';

interface ActivityData {
    date: string;
    count: number;
    level: number;
}

interface ContributionGraphProps {
    showLabel?: boolean;
    blockSize?: number;
    maxHeight?: number;
    showYearSelector?: boolean;
}

const ContributionGraph: React.FC<ContributionGraphProps> = ({
    showLabel = true,
    blockSize = 12,
    maxHeight,
    showYearSelector = false,
}) => {
    const [activityData, setActivityData] = useState<ActivityData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const { isDarkMode } = useTheme();
    const API_URL = getApiBaseUrl();

    // Generate available years (from 2025 to current year)
    const currentYear = new Date().getFullYear();
    const availableYears = Array.from(
        { length: currentYear - 2025 + 1 },
        (_, i) => currentYear - i
    );

    useEffect(() => {
        const fetchActivityData = async () => {
            try {
                setLoading(true);
                const token = getToken();
                if (!token) return;

                const response = await fetch(`${API_URL}/profile/activity?year=${selectedYear}`, {
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
            <div className="w-full p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                    Chưa có hoạt động nào trong năm {selectedYear}. Hãy bắt đầu làm bài kiểm tra!
                </p>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Graph with Year Selector - GitHub style layout */}
            <div className={showYearSelector ? "flex gap-6" : "w-full"}>
                {/* Graph */}
                <div
                    className="flex-1 overflow-x-auto custom-scrollbar"
                    style={{ maxHeight: maxHeight || 'auto' }}
                >
                    <div className="min-w-max">
                        <ActivityCalendar
                            data={activityData}
                            theme={explicitTheme}
                            colorScheme={isDarkMode ? 'dark' : 'light'}
                            blockSize={blockSize}
                            blockMargin={4}
                            fontSize={12}
                            labels={{
                                legend: {
                                    less: 'Ít',
                                    more: 'Nhiều',
                                },
                                months: [
                                    'Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6',
                                    'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12',
                                ],
                                weekdays: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
                                totalCount: showLabel
                                    ? `{{count}} lần làm bài trong năm ${selectedYear}`
                                    : undefined,
                            }}
                            renderBlock={(block, activity) =>
                                React.cloneElement(block, {
                                    'data-tooltip-id': 'activity-tooltip',
                                    'data-tooltip-content': activity.count > 0
                                        ? `${activity.count} lần làm bài vào ${new Date(activity.date).toLocaleDateString('vi-VN', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}`
                                        : `Không có hoạt động vào ${new Date(activity.date).toLocaleDateString('vi-VN', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}`,
                                } as any)
                            }
                            showWeekdayLabels
                            style={{
                                color: isDarkMode ? '#9ca3af' : '#4b5563',
                            }}
                        />
                    </div>
                </div>

                {/* Year Selector - Vertical on right like GitHub */}
                {showYearSelector && (
                    <div className="flex flex-col gap-2 min-w-[80px]">
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Năm</div>
                        {availableYears.map((year) => (
                            <button
                                key={year}
                                onClick={() => setSelectedYear(year)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedYear === year
                                        ? 'bg-blue-500 text-white shadow-md'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Tooltip styles */}
            <style>{`
        [data-tooltip-id='activity-tooltip'] {
          cursor: pointer;
          position: relative;
        }
        
        [data-tooltip-id='activity-tooltip']:hover::after {
          content: attr(data-tooltip-content);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 12px;
          background: ${isDarkMode ? '#1f2937' : '#374151'};
          color: white;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 1000;
          margin-bottom: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        
        [data-tooltip-id='activity-tooltip']:hover::before {
          content: '';
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 6px;
          border-style: solid;
          border-color: ${isDarkMode ? '#1f2937' : '#374151'} transparent transparent transparent;
          z-index: 1000;
          margin-bottom: 2px;
        }
      `}</style>
        </div>
    );
};

export default ContributionGraph;
