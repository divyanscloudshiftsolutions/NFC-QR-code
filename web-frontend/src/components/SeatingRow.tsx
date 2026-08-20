import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SeatingRowProps {
  capacity: number;
  tableCount: number;
  children: React.ReactNode;
}

export const SeatingRow: React.FC<SeatingRowProps> = ({ capacity, tableCount, children }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);

  const checkScroll = () => {
    const el = rowRef.current;
    if (!el) return;

    // Width of card is 290px, gap is 20px (gap-5)
    const requiredWidth = tableCount * 290 + (tableCount - 1) * 20;
    // Check if the container width is smaller than required width + padding buffer (40px)
    const isOverflowing = el.clientWidth < requiredWidth + 40;
    setShouldScroll(isOverflowing);

    if (isOverflowing) {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    } else {
      setCanScrollLeft(false);
      setCanScrollRight(false);
    }
  };

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    checkScroll();
    const timer = setTimeout(checkScroll, 100);

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [children, tableCount]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;
    const scrollAmount = Math.max(300, el.clientWidth * 0.75);
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="space-y-4 py-4 md:py-6 first:pt-0 border-b border-border-sidebar/30 last:border-b-0 relative">
      {/* Capacity Group Section Heading */}
      <div className="flex items-center justify-between border-b border-border-sidebar/40 pb-2 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full dark:bg-[#D4AF37] bg-primary" />
          <h3 className="text-xs md:text-sm font-black text-text-primary uppercase tracking-widest leading-none">
            {capacity} {capacity === 1 ? 'Seat Table' : 'Seats Tables'}
          </h3>
        </div>
        
        <div className="flex items-center gap-2.5">
          <span className="px-3 py-0.5 rounded-full dark:bg-[#D4AF37]/10 bg-primary/10 dark:border-[#D4AF37]/30 border-primary/20 dark:text-[#D4AF37] text-primary text-[10px] font-mono font-black">
            {tableCount} {tableCount === 1 ? 'Table' : 'Tables'}
          </span>
          {shouldScroll && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                className={`p-1.5 rounded-lg border border-border-main transition-all flex items-center justify-center ${
                  canScrollLeft
                    ? 'text-text-main hover:bg-bg-primary cursor-pointer'
                    : 'text-text-muted opacity-30 cursor-not-allowed'
                }`}
                aria-label="Scroll Left"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                className={`p-1.5 rounded-lg border border-border-main transition-all flex items-center justify-center ${
                  canScrollRight
                    ? 'text-text-main hover:bg-bg-primary cursor-pointer'
                    : 'text-text-muted opacity-30 cursor-not-allowed'
                }`}
                aria-label="Scroll Right"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row Container */}
      <div className="relative">
        {/* Scrollable Row / Flex wrap row */}
        <div
          ref={rowRef}
          className={`pt-1 pb-2 w-full ${
            shouldScroll 
              ? 'flex items-center gap-5 overflow-x-auto scroll-smooth snap-x no-scrollbar' 
              : 'flex flex-wrap gap-5 justify-start'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
