import { AppearanceSelector } from "@/components/settings/appearance-selector";

/**
 * Aqenra Phase D — staff Settings -> Appearance. No DB read here: the
 * authenticated (dashboard) layout above this page has already
 * reconciled `useTheme().mode` from `User.themeMode` (see
 * ThemePreferenceReconciler) before this page ever renders — this page
 * only needs the live client `useTheme()` state, never a second server
 * read of themeMode.
 */
export default function AppearanceSettingsPage() {
  return (
    <div>
      <h1 className="text-text-primary text-2xl font-semibold tracking-tight">Appearance</h1>
      <p className="text-text-secondary mt-1 text-sm">Choose how Aqenra looks on this device.</p>

      <div className="mt-6">
        <AppearanceSelector />
      </div>
    </div>
  );
}
