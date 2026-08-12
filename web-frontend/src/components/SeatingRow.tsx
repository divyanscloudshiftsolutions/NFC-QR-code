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

 const checkScroll = () => {
 const el = rowRef.current;
 if (!el) return;
 const { scrollLeft, scrollWidth, clientWidth } = el;
 setCanScrollLeft(scrollLeft > 5);
 setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
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
 }, [children]);

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
 <div className="w-2 h-2 rounded-full dark:bg-[#D4AF37] bg-primary 0_0_8px_#D4AF37] 0_0_8px_rgba(124,58,237,0.5)]" />
 <h3 className="text-xs md:text-sm font-black text-text-primary uppercase tracking-widest leading-none">
 {capacity} {capacity === 1 ? 'Seat Table' : 'Seats Tables'}
 </h3>
 </div>
 <span className="px-3 py-0.5 rounded-full dark:bg-[#D4AF37]/10 bg-primary/10 dark:border-[#D4AF37]/30 border-primary/20 dark:text-[#D4AF37] text-primary text-[10px] font-mono font-black">
 {tableCount} {tableCount === 1 ? 'Table' : 'Tables'}
 </span>
 </div>

 {/* Row Container with Glass Edge Arrows */}
 <div className="relative flex items-center group">
 {/* Circular Left Arrow Button */}
 {canScrollLeft && (
 <button
 type="button"
 onClick={() => handleScroll('left')}
 className="absolute left-1 md:-left-4 z-30 w-10 h-10 rounded-full glass-panel bg-bg-surface/90 dark:hover:bg-[#D4AF37] hover:bg-primary dark:border-[#D4AF37]/40 border-primary/40 dark:text-[#D4AF37] text-primary hover:text-white dark: flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
 aria-label="Scroll Left"
 >
 <ChevronLeft size={22} />
 </button>
 )}

 {/* Scrollable Row (No Visible Scrollbar) */}
 <div
 ref={rowRef}
 className="flex items-center gap-5 overflow-x-auto pb-2 pt-1 scroll-smooth snap-x no-scrollbar w-full"
 >
 {children}
 </div>

 {/* Circular Right Arrow Button */}
 {canScrollRight && (
 <button
 type="button"
 onClick={() => handleScroll('right')}
 className="absolute right-1 md:-right-4 z-30 w-10 h-10 rounded-full glass-panel bg-bg-surface/90 dark:hover:bg-[#D4AF37] hover:bg-primary dark:border-[#D4AF37]/40 border-primary/40 dark:text-[#D4AF37] text-primary hover:text-white dark: flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
 aria-label="Scroll Right"
 >
 <ChevronRight size={22} />
 </button>
 )}
 </div>
 </div>
 );
};
