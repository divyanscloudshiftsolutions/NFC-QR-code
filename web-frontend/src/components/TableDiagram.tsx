import React from 'react';
import { useAuth } from '../context/AuthContext';

interface TableDiagramProps {
 capacity: number;
 occupiedCount?: number;
 status?: string;
 tableNumber: string;
 className?: string;
}

export const TableDiagram: React.FC<TableDiagramProps> = ({
 capacity = 4,
 occupiedCount = 0,
 status = 'available',
 tableNumber,
 className = '',
}) => {
 const { isDark } = useAuth();
 const cap = Math.max(1, capacity);
 const occ = Math.min(cap, Math.max(0, occupiedCount));

 const isFull = (status === 'occupied' && occ >= cap) || (occ >= cap && cap > 0);
 const isPartial = (status === 'occupied' && occ > 0 && occ < cap) || (occ > 0 && occ < cap);
 const isAvailable = status === 'available' || (occ === 0 && status !== 'reserved' && status !== 'maintenance' && status !== 'in_checkin');

 // Mathematical distribution of chairs around 4 edges
 let topCount = 0;
 let bottomCount = 0;
 let hasLeft = false;
 let hasRight = false;

 if (cap === 1) {
 hasLeft = true;
 } else if (cap === 2) {
 hasLeft = true;
 hasRight = true;
 } else if (cap === 3) {
 hasLeft = true;
 hasRight = true;
 topCount = 1;
 } else if (cap === 4) {
 hasLeft = true;
 hasRight = true;
 topCount = 1;
 bottomCount = 1;
 } else {
 hasLeft = true;
 hasRight = true;
 const remainder = cap - 2;
 topCount = Math.ceil(remainder / 2);
 bottomCount = Math.floor(remainder / 2);
 }

 const maxLongEdge = Math.max(topCount, bottomCount, 1);
 const tableWidth = Math.max(44, 24 + maxLongEdge * 16);
 const tableHeight = 32;
 const margin = 14;

 const svgWidth = tableWidth + margin * 2;
 const svgHeight = tableHeight + margin * 2;

 const tx = margin;
 const ty = margin;

 // Generate chairs list with index to check occupied status
 const chairs: { key: string; x: number; y: number; w: number; h: number; index: number }[] = [];
 let seatIdx = 0;

 if (hasLeft) {
 chairs.push({
 key: 'chair-left',
 x: tx - 6 - 2,
 y: ty + (tableHeight - 10) / 2,
 w: 6,
 h: 10,
 index: seatIdx++,
 });
 }

 if (hasRight) {
 chairs.push({
 key: 'chair-right',
 x: tx + tableWidth + 2,
 y: ty + (tableHeight - 10) / 2,
 w: 6,
 h: 10,
 index: seatIdx++,
 });
 }

 // Top chairs
 for (let i = 0; i < topCount; i++) {
 const xPos =
 topCount === 1
 ? tx + (tableWidth - 10) / 2
 : tx + 6 + (i * (tableWidth - 12 - 10)) / (topCount - 1);
 chairs.push({
 key: `chair-top-${i}`,
 x: xPos,
 y: ty - 6 - 2,
 w: 10,
 h: 6,
 index: seatIdx++,
 });
 }

 // Bottom chairs
 for (let i = 0; i < bottomCount; i++) {
 const xPos =
 bottomCount === 1
 ? tx + (tableWidth - 10) / 2
 : tx + 6 + (i * (tableWidth - 12 - 10)) / (bottomCount - 1);
 chairs.push({
 key: `chair-bottom-${i}`,
 x: xPos,
 y: ty + tableHeight + 2,
 w: 10,
 h: 6,
 index: seatIdx++,
 });
 }

 // Chair styling based on exact user rules:
 // 1. Available table seat -> Green color shade (#10B981)
 // 2. Fully Occupied table seat / Filled seats -> Red color shade (#EF4444)
 // 3. Partially Occupied table -> Occupied seats Red (#EF4444), Balance seats Orange/Yellow (#F59E0B)
 const getChairStyle = (index: number) => {
 if (status === 'maintenance') {
 return {
 fill: 'rgba(107, 114, 128, 0.4)',
 stroke: '#6B7280',
 strokeWidth: 1.2,
 statusText: 'Maintenance',
 };
 }

 if (status === 'reserved' && occ === 0) {
 return {
 fill: 'rgba(59, 130, 246, 0.5)',
 stroke: '#3B82F6',
 strokeWidth: 1.2,
 statusText: 'Reserved',
 };
 }

 if (status === 'in_checkin') {
    return {
      fill: 'rgba(245, 158, 11, 0.5)',
      stroke: '#F59E0B',
      strokeWidth: 1.2,
      statusText: 'In Check-In (Locked)',
    };
  }

 // Completely Available (0 seats occupied)
 if (occ === 0) {
 return {
 fill: 'rgba(16, 185, 129, 0.6)',
 stroke: '#10B981',
 strokeWidth: 1.2,
 statusText: 'Available (Green)',
 };
 }

 // Completely Occupied (100% full capacity)
 if (occ >= cap) {
 return {
 fill: 'rgba(239, 68, 68, 0.7)',
 stroke: '#EF4444',
 strokeWidth: 1.2,
 statusText: 'Occupied (Red)',
 };
 }

 // Partially Occupied (e.g. 4 out of 6 seats filled)
 if (index < occ) {
 // Occupied seat -> Red color shade
 return {
 fill: 'rgba(239, 68, 68, 0.7)',
 stroke: '#EF4444',
 strokeWidth: 1.2,
 statusText: 'Occupied (Red)',
 };
 } else {
 // Balance seat -> Orange / Yellowish shade color
 return {
 fill: 'rgba(245, 158, 11, 0.7)',
 stroke: '#F59E0B',
 strokeWidth: 1.2,
 statusText: 'Balance Seat (Orange/Yellow)',
 };
 }
 };

 // Table surface color matching status
 let tableFill = 'rgba(212, 175, 55, 0.08)';
 let tableStroke = 'rgba(212, 175, 55, 0.35)';

 if (isFull) {
 tableFill = 'rgba(239, 68, 68, 0.08)';
 tableStroke = 'rgba(239, 68, 68, 0.4)';
 } else if (isPartial) {
 tableFill = 'rgba(245, 158, 11, 0.08)';
 tableStroke = 'rgba(245, 158, 11, 0.4)';
 } else if (status === 'in_checkin') {
    tableFill = 'rgba(245, 158, 11, 0.08)';
    tableStroke = 'rgba(245, 158, 11, 0.4)';
  } else if (isAvailable) {
 tableFill = 'rgba(16, 185, 129, 0.08)';
 tableStroke = 'rgba(16, 185, 129, 0.4)';
 }

 return (
 <div className={`flex items-center justify-center w-full h-full p-2 ${className}`}>
 <svg
 viewBox={`0 0 ${svgWidth} ${svgHeight}`}
 className="max-w-full max-h-full transition-all duration-300 "
 style={{ width: '100%', height: 'auto', maxHeight: '100px' }}
 >
 {/* Central Table Surface */}
 <rect
 x={tx}
 y={ty}
 width={tableWidth}
 height={tableHeight}
 rx={6}
 ry={6}
 fill={tableFill}
 stroke={tableStroke}
 strokeWidth={1.5}
 className="transition-all"
 />

 {/* Inner Table Glass Accent Line */}
 <rect
 x={tx + 3}
 y={ty + 3}
 width={tableWidth - 6}
 height={tableHeight - 6}
 rx={4}
 ry={4}
 fill="none"
 stroke="rgba(255, 255, 255, 0.08)"
 strokeWidth={1}
 />

 {/* Table Number Identifier */}
 <text
 x={tx + tableWidth / 2}
 y={ty + tableHeight / 2 + 3.5}
 textAnchor="middle"
 fill={isFull ? '#EF4444' : isPartial ? '#F59E0B' : status === 'in_checkin' ? '#F59E0B' : isAvailable ? '#10B981' : (isDark ? '#D4AF37' : '#7C3AED')}
 fontSize="9.5"
 fontWeight="900"
 fontFamily="monospace"
 letterSpacing="0.5"
 >
 {tableNumber}
 </text>

 {/* Dynamically Generated Chairs */}
 {chairs.map((c) => {
 const style = getChairStyle(c.index);
 return (
 <rect
 key={c.key}
 x={c.x}
 y={c.y}
 width={c.w}
 height={c.h}
 rx={2}
 ry={2}
 fill={style.fill}
 stroke={style.stroke}
 strokeWidth={style.strokeWidth}
 className="transition-all duration-300"
 >
 <title>{`Seat #${c.index + 1}: ${style.statusText}`}</title>
 </rect>
 );
 })}
 </svg>
 </div>
 );
};

