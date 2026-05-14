import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        muted: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-foreground',
        success:
          'bg-emerald-950/40 text-emerald-300 border border-emerald-900',
        warning:
          'bg-amber-950/40 text-amber-300 border border-amber-900',
        destructive: 'bg-destructive text-destructive-foreground',
        accent: 'bg-accent text-accent-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
