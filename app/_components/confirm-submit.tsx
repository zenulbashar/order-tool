"use client";

import { Button } from "@/app/_components/button";

/**
 * Submit button that asks for confirmation before allowing the enclosing
 * <form> (a Server Action) to submit. The shared destructive-confirm affordance
 * for any action whose effect can't be undone or that FK-cascades everything
 * beneath the row (menu categories/items/groups, tables, stations, gift-card
 * void, …). Renders the destructive Button variant so destructive intent reads
 * consistently across the app.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="destructive"
      size="sm"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Button>
  );
}
