import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates a numeric value from its previous displayed value up (or down) to
 * a new target over `durationMs`, easing out. Intended for the moment a
 * simulation result or metric first lands — not for continuous ticking data
 * (use the existing flash-up/flash-down price treatment for that instead).
 *
 * Snaps instantly if the user has prefers-reduced-motion enabled.
 */
export function useCountUp(target: number | undefined, durationMs: number = 600): number | undefined {
    const [display, setDisplay] = useState<number | undefined>(target);
    const fromRef = useRef<number>(0);
    const frameRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (target === undefined) {
            setDisplay(undefined);
            return;
        }

        if (prefersReducedMotion()) {
            setDisplay(target);
            fromRef.current = target;
            return;
        }

        const from = fromRef.current;
        const start = performance.now();

        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setDisplay(from + (target - from) * eased);
            if (progress < 1) {
                frameRef.current = requestAnimationFrame(tick);
            } else {
                fromRef.current = target;
            }
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [target, durationMs]);

    return display;
}
