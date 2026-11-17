import { AlertCircle, CheckCircle2, Cloud, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import type { WorkspaceTab } from '../types/podcast';
import { PhiloA2BalleLogo } from './PhiloA2BalleLogo';

export type CloudSyncState = 'signed_out' | 'connecting' | 'syncing' | 'synced' | 'error';

export interface CloudUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface TopBarProps {
  brandTitle?: string;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onCreateEpisode: () => void;
  onOpenMobileMenu?: () => void;
  onReturnMobileHome?: () => void;
  cloudUser?: CloudUserSummary | null;
  cloudSyncState?: CloudSyncState;
  cloudError?: string | null;
  onDismissCloudError?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'script', label: 'Script & Sources' },
  { id: 'studio', label: 'Studio & Mixage' },
  { id: 'prompter', label: 'Prompteur' },
  { id: 'publish', label: 'Publication' },
];

export function TopBar({
  brandTitle = 'PHILOA2BALLES',
  activeTab,
  onSelectTab,
  onCreateEpisode,
  onOpenMobileMenu,
  onReturnMobileHome,
  cloudUser = null,
  cloudSyncState = 'signed_out',
  cloudError = null,
  onDismissCloudError,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const shortUserLabel =
    cloudUser?.displayName?.split(' ')[0] ||
    cloudUser?.email?.split('@')[0] ||
    'Cloud';

  return (
    <header className="sticky top-0 z-30 bg-[#F6F5F0]/95 backdrop-blur-sm border-b border-[#E5E2D9]">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 h-14 md:h-16 flex items-center justify-between gap-2 md:gap-6">
        {/* Zone 1: Mobile Burger + Brand Logo + Wordmark */}
        <div className="flex items-center gap-1.5 min-w-0">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Ouvrir le menu"
              data-testid="mobile-burger-button"
              className="md:hidden min-w-[44px] min-h-[44px] -ml-1.5 flex items-center justify-center rounded-lg text-[#18181B] hover:bg-[#ECEAE2] transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window !== 'undefined' && window.innerWidth < 768 && onReturnMobileHome) {
                onReturnMobileHome();
              } else {
                onSelectTab('script');
              }
            }}
            className="inline-flex items-center gap-2 sm:gap-2.5 font-display text-sm sm:text-lg md:text-xl font-bold tracking-tight text-[#18181B] whitespace-nowrap shrink-0 max-w-[180px] sm:max-w-[260px] md:max-w-[290px]"
          >
            <PhiloA2BalleLogo
              windStrength="brise"
              showFrame={false}
              className="w-10 sm:w-12 rounded-md shrink-0"
            />
            <span className="truncate">{brandTitle}</span>
          </a>
        </div>

        {/* Zone 2: Single-line navigation links (Desktop) */}
        <nav aria-label="Navigation principale" className="hidden md:flex items-center gap-5 lg:gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C2410C] ${
                  isActive
                    ? 'text-[#18181B]'
                    : 'text-[#52525B] hover:text-[#18181B]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#C2410C]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cloud Sync + Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          {!cloudUser ? (
            <button
              type="button"
              onClick={onSignIn}
              disabled={cloudSyncState === 'connecting'}
              aria-label="Synchroniser dans le cloud avec Google"
              title="Connectez votre compte Google une seule fois pour synchroniser vos appareils"
              className="inline-flex items-center gap-1.5 min-h-[40px] md:min-h-0 px-2.5 md:px-3 py-1.5 md:py-2 text-xs font-medium text-[#18181B] bg-white hover:bg-[#FAF9F5] border border-[#D6D2C4] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
            >
              {cloudSyncState === 'connecting' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C2410C]" aria-hidden="true" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-[#C2410C]" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {cloudSyncState === 'connecting' ? 'Synchro...' : 'Synchroniser'}
              </span>
              <span className="sm:hidden">
                {cloudSyncState === 'connecting' ? '...' : 'Cloud'}
              </span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 min-h-[40px] md:min-h-0 pl-2.5 pr-1.5 py-1 bg-white border border-[#D6D2C4] rounded-lg shrink-0">
              {cloudSyncState === 'syncing' || cloudSyncState === 'connecting' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C2410C]" aria-hidden="true" />
              ) : cloudSyncState === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" aria-hidden="true" />
              )}
              <span className="text-xs font-medium text-[#18181B] max-w-[96px] truncate hidden sm:inline" title={cloudUser.email ?? undefined}>
                {cloudSyncState === 'syncing' ? 'Synchro...' : shortUserLabel}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Se déconnecter du compte Google"
                title="Se déconnecter"
                className="p-1 text-[#71717A] hover:text-[#18181B] rounded transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onCreateEpisode}
            className="hidden md:inline-flex px-3.5 md:px-4 py-2 text-sm font-medium text-white bg-[#18181B] hover:bg-[#27272A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]"
          >
            Nouvel épisode
          </button>
        </div>
      </div>

      {/* Cloud error notice */}
      {cloudError && (
        <div
          role="alert"
          className="bg-[#FEF2F2] border-t border-[#FECACA] px-4 py-2 text-xs text-[#991B1B] flex items-center justify-between gap-3 max-w-[1440px] mx-auto"
        >
          <span>{cloudError}</span>
          {onDismissCloudError && (
            <button
              type="button"
              onClick={onDismissCloudError}
              aria-label="Fermer l’alerte de synchronisation"
              className="p-0.5 hover:text-[#7F1D1D] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </header>
  );
}
