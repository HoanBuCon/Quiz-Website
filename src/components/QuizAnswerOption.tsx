import React, { useState } from "react";
import MathText from "./MathText";

interface QuizAnswerOptionProps {
    option: string;
    index: number;
    optionImage?: string;
    selected: boolean;
    correct: boolean;
    shouldReveal: boolean;
    focused: boolean;
    disabled: boolean;
    onSelect: () => void;
    onViewImage: (src: string) => void;
}

const QuizAnswerOption: React.FC<QuizAnswerOptionProps> = ({
    option,
    index,
    optionImage,
    selected,
    correct,
    shouldReveal,
    focused,
    disabled,
    onSelect,
    onViewImage,
}) => {


    // Styles definition
    const base =
        "w-full p-3 sm:p-4 text-left rounded-lg transition-all duration-200 border text-sm sm:text-base disabled:cursor-not-allowed";
    const chosenStyle_Base =
        "bg-primary-100 text-primary-900 border-primary-600 dark:bg-primary-900/50 dark:text-primary-100 dark:border-primary-400";
    const chosenShadow =
        "shadow-md shadow-primary-500/20 dark:shadow-md dark:shadow-primary-500/25";
    const normalStyle =
        "bg-white text-gray-800 border-gray-400 hover:border-gray-500 hover:bg-stone-100 hover:shadow-md hover:shadow-gray-400/15 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-700/50 dark:hover:shadow-md dark:hover:shadow-gray-400/20";
    const correctStyle_Base =
        "bg-green-500 text-white border-green-600 dark:bg-green-900/40 dark:text-green-100 dark:border-green-500";
    const correctShadow = "shadow-md shadow-green-500/20";
    const wrongChosenStyle_Base =
        "bg-red-600 text-white border-red-700 dark:bg-red-900/40 dark:text-red-200 dark:border-red-500";
    const wrongChosenShadow = "shadow-md shadow-red-600/20";
    const focusNormal =
        "border-indigo-400 shadow-[0_0_18px_rgba(99,102,241,0.7)] dark:border-white dark:shadow-[0_0_18px_rgba(255,255,255,0.5)]";
    const focusChosen =
        "border-primary-600 shadow-[0_0_18px_rgba(59,130,246,0.7)] dark:border-primary-400 dark:shadow-[0_0_18px_rgba(96,165,250,0.7)]";
    const focusCorrect =
        "border-green-600 shadow-[0_0_18px_rgba(22,163,74,0.7)] dark:border-green-500 dark:shadow-[0_0_18px_rgba(34,197,94,0.7)]";
    const focusWrong =
        "border-red-700 shadow-[0_0_18px_rgba(185,28,28,0.7)] dark:border-red-500 dark:shadow-[0_0_18px_rgba(239,68,68,0.7)]";

    let computedClassName = "";
    if (shouldReveal) {
        if (correct) {
            computedClassName = focused
                ? `${correctStyle_Base} ${focusCorrect}`
                : `${correctStyle_Base} ${correctShadow}`;
        } else if (selected) {
            computedClassName = focused
                ? `${wrongChosenStyle_Base} ${focusWrong}`
                : `${wrongChosenStyle_Base} ${wrongChosenShadow}`;
        } else {
            computedClassName = focused
                ? `${normalStyle} ${focusNormal}`
                : normalStyle;
        }
    } else {
        if (selected) {
            computedClassName = focused
                ? `${chosenStyle_Base} ${focusChosen}`
                : `${chosenStyle_Base} ${chosenShadow}`;
        } else {
            computedClassName = focused ? `${normalStyle} ${focusNormal}` : normalStyle;
        }
    }

    // Icon background classes
    let iconBgClasses = "";
    if (shouldReveal && correct) {
        iconBgClasses =
            "bg-green-500 text-white dark:bg-green-600/20 dark:text-green-100";
    } else if (shouldReveal && selected && !correct) {
        iconBgClasses =
            "bg-red-600 text-white dark:bg-red-600/20 dark:text-red-100";
    } else if (selected && !shouldReveal) {
        iconBgClasses =
            "bg-primary-300/30 text-primary-900 dark:bg-primary-600/20 dark:text-primary-100";
    } else {
        iconBgClasses =
            "bg-gray-100 group-hover/answer:bg-gray-200 text-gray-800 dark:bg-gray-700/20 dark:group-hover/answer:bg-gray-700/20 dark:text-gray-100";
    }

    const [layoutMode, setLayoutMode] = useState<"row" | "col">("col");

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const { naturalWidth, naturalHeight } = img;
        const ratio = naturalWidth / naturalHeight;

        // Portrait/Square → always row layout (right side)
        if (ratio <= 4 / 3) {
            setLayoutMode("row");
            return;
        }

        // Wide landscape → check if it fits on right without collision
        // Get button container to measure available space
        const button = img.closest('button');
        if (!button) {
            // Fallback: use col layout if can't measure
            setLayoutMode("col");
            return;
        }

        const containerWidth = button.offsetWidth;

        // Calculate rendered image width when constrained by max-h-[400px]
        const maxHeight = 400;
        const renderedWidth = (naturalWidth / naturalHeight) * Math.min(maxHeight, naturalHeight);

        // In row layout, image gets max-w-[50%] on desktop (sm breakpoint)
        // Check if 50% of container is enough for this image
        const maxImageWidth = containerWidth * 0.5;

        // If image fits in 50% with some margin (0.9 factor), use row layout
        // Otherwise use col layout to avoid collision
        if (renderedWidth <= maxImageWidth * 0.9) {
            setLayoutMode("row");
        } else {
            setLayoutMode("col");
        }
    };

    return (
        <button
            aria-disabled={disabled}
            onClick={(e) => {
                if (!disabled) onSelect();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
            }}
            className={`allow-selection group/answer ${base.replace('disabled:cursor-not-allowed', '')} ${disabled ? 'cursor-not-allowed' : ''} ${computedClassName} flex ${layoutMode === "row" ? "flex-col sm:flex-row sm:flex-wrap !items-start" : "flex-col"
                } gap-3`}
        >
            <div className={`flex flex-col gap-3 ${layoutMode === "row" ? "w-full sm:flex-1 sm:min-w-[55%]" : "w-full text-left"}`}>
                {/* Row 1: Icon, Tick, Content */}
                <div className="flex w-full items-center gap-3">
                    <div className="flex items-center gap-2">
                        {/* Icon letter */}
                        <div
                            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg transition-colors ${iconBgClasses}`}
                        >
                            {String.fromCharCode(65 + index)}
                        </div>

                        {/* Status Icon */}
                        {shouldReveal && (
                            <div className="flex items-center justify-center w-6">
                                {correct ? (
                                    <svg
                                        className="w-6 h-6 text-green-100 dark:text-green-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                ) : selected && !correct ? (
                                    <svg
                                        className="w-6 h-6 text-red-100 dark:text-red-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Text Content */}
                    <div className="flex-1 min-w-0">
                        <span className="whitespace-pre-wrap break-words block">
                            <MathText text={option} />
                        </span>
                    </div>
                </div>
            </div>

            {optionImage && (
                <img
                    src={optionImage}
                    alt={`Option ${String.fromCharCode(65 + index)}`}
                    onLoad={handleImageLoad}
                    className={`${layoutMode === "row"
                        ? "w-auto max-h-[400px] min-w-[69px] min-h-[69px] self-center sm:h-auto sm:max-w-[50%] sm:ml-auto sm:self-center"
                        : "w-auto max-h-[400px] min-h-[69px] self-center sm:self-end"
                        } rounded-lg border border-gray-200 dark:border-gray-600 object-contain cursor-zoom-in`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewImage(optionImage);
                    }}
                />
            )}
        </button>
    );
};

export default QuizAnswerOption;
