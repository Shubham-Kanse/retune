"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    fullName: string;
    currentTitle: string | null;
    location: string;
    targetRoles: string[];
  } | null;
  onSave: (data: { fullName: string; currentTitle: string; location: string }) => void;
  isSaving?: boolean;
}

export function ProfileEditModal({
  isOpen,
  onClose,
  profile,
  onSave,
  isSaving,
}: ProfileEditModalProps) {
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [currentTitle, setCurrentTitle] = useState(profile?.currentTitle ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setFullName(profile?.fullName ?? "");
    setCurrentTitle(profile?.currentTitle ?? "");
    setLocation(profile?.location ?? "");
    setError("");
  }, [isOpen, profile?.fullName, profile?.currentTitle, profile?.location]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }

    if (!currentTitle.trim()) {
      setError("Current title is required");
      return;
    }

    if (!location.trim()) {
      setError("Location is required");
      return;
    }

    onSave({
      fullName: fullName.trim(),
      currentTitle: currentTitle.trim(),
      location: location.trim(),
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-border bg-background p-6 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Edit Profile</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-muted transition-colors"
              aria-label="Close"
              disabled={isSaving}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="rt-label">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="rt-input mt-1.5"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="rt-label">Current Title</label>
              <input
                type="text"
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                placeholder="e.g., Senior Software Engineer"
                className="rt-input mt-1.5"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="rt-label">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., San Francisco, CA"
                className="rt-input mt-1.5"
                disabled={isSaving}
              />
            </div>

            {error && (
              <div className="rounded-sm border border-red-500/30 bg-red-500/5 px-3 py-2.5 flex items-start gap-2">
                <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rt-btn-ghost flex-1"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className="rt-btn flex-1" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
