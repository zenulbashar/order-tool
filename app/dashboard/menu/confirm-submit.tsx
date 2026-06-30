"use client";

import { Button } from "@/app/_components/button";

/**
 * Submit button that asks for confirmation before allowing the enclosing
 * <form> (a Server Action) to submit. Used for destructive actions whose FK
 * cascade removes everything beneath the row (categories, items, groups).
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
