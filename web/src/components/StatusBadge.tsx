import type { ReactNode } from 'react';
import { Badge } from './ui/badge';

type StatusBadgeProps = {
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  const variantMap = {
    neutral: 'secondary',
    success: 'default',
    warning: 'outline',
    danger: 'destructive',
  } as const;
  
  return <Badge variant={variantMap[tone] || 'default'} className={tone === 'success' ? 'bg-emerald-500 hover:bg-emerald-600' : tone === 'warning' ? 'text-amber-600 border-amber-600' : ''}>{children}</Badge>;
}
