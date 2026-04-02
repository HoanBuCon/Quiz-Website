import { useEffect, RefObject } from 'react';

// Custom hook to detect outside clicks
export const useOutsideAlerter = (ref: RefObject<HTMLElement>, callback: () => void, ignoreClassName?: string) => {
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // If an ignore class is provided, check if the click target or its parent has it.
            if (ignoreClassName && (event.target as HTMLElement).closest(`.${ignoreClassName}`)) {
                return;
            }

            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };
        // Using "click" instead of "mousedown" to prevent a race condition
        // where a menu is closed before a button's click event inside it can be processed.
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, [ref, callback, ignoreClassName]);
}
