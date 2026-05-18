"use client";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-red-800 bg-red-900/20 p-4"
    >
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg bg-red-800 px-4 py-1.5 text-xs font-medium text-red-100 hover:bg-red-700 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
