import React, { useState, useRef, useEffect } from 'react';
import {
  Church,
  ChevronDown,
  Menu,
  X,
  LogOut,
  User,
  Calendar,
  Clock,
  Users,
  CheckSquare,
  MessageSquare,
  UserCheck,
  BookOpen,
  Settings as SettingsIcon,
  Home,
  StickyNote,
  Palette,
  Check,
  Inbox,
  MessageSquarePlus,
  Sun,
  Moon,
  Facebook
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { HeaderLiveClock } from './HeaderLiveClock';
import { AccentColor, ColorScheme, ThemeBase } from '../types';
import { ACCENT_CATALOGUE, THEME_CATALOGUE, normalizeAppearance } from '../lib/themes';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenViewerNote?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onNavigate, onOpenViewerNote }) => {
  const { username, logout, isViewer, publicBranding } = useAuth();
  const { settings, updateSettings, viewerNotes } = useData();
  const newViewerNotesCount = isViewer ? 0 : viewerNotes.filter(n => n.status !== 'done').length;
  const displayChurchName = settings.churchName || publicBranding.churchName || 'Our Church';
  const rawFacebookLink = (settings.facebookLink || '').trim();
  const facebookHref = rawFacebookLink
    ? (/^https?:\/\//i.test(rawFacebookLink) ? rawFacebookLink : `https://${rawFacebookLink}`)
    : '';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Desktop dropdown states
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [peopleDropdownOpen, setPeopleDropdownOpen] = useState(false);
  const [tasksDropdownOpen, setTasksDropdownOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // Mobile accordion states
  const [mobileServicesExpanded, setMobileServicesExpanded] = useState(false);
  const [mobilePeopleExpanded, setMobilePeopleExpanded] = useState(false);
  const [mobileTasksExpanded, setMobileTasksExpanded] = useState(false);

  const servicesRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (servicesRef.current && !servicesRef.current.contains(target)) {
        setServicesDropdownOpen(false);
      }
      if (peopleRef.current && !peopleRef.current.contains(target)) {
        setPeopleDropdownOpen(false);
      }
      if (tasksRef.current && !tasksRef.current.contains(target)) {
        setTasksDropdownOpen(false);
      }
      if (appearanceRef.current && !appearanceRef.current.contains(target)) {
        setAppearanceOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAppearanceOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNavClick = (tab: string) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
    setServicesDropdownOpen(false);
    setPeopleDropdownOpen(false);
    setTasksDropdownOpen(false);
    setAppearanceOpen(false);
  };

  const activeAppearance = normalizeAppearance(settings.theme, settings.colorScheme);

  const handleViewerPrefChange = async (updates: {
    colorScheme?: ColorScheme;
    theme?: ThemeBase;
    accentColor?: AccentColor;
  }) => {
    try {
      await updateSettings(updates);
    } catch (err) {
      console.warn('Viewer preference update warning:', err);
    }
  };

  // Group active checks
  const isServicesActive = isViewer
    ? currentTab === 'schedules'
    : currentTab === 'regular-services' || currentTab === 'schedules';
  const isPeopleActive = currentTab === 'people-ministries' || currentTab === 'visitors';
  const isTasksActive =
    currentTab === 'tasks' ||
    currentTab === 'quick-notes' ||
    currentTab === 'viewer-notes' ||
    currentTab === 'forerunner-studio' ||
    currentTab === 'sunday-school';
  const isMessagingActive = currentTab === 'message-templates';

  return (
    <header className="sticky top-0 z-40 w-full bg-surface border-b border-subtle shadow-xs select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Church Logo and Name */}
        <div
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 cursor-pointer group shrink-0"
        >
          {settings.churchLogo ? (
            <img
              src={settings.churchLogo}
              alt={displayChurchName}
              className="w-9 h-9 object-contain shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-accent-tint text-accent flex items-center justify-center border border-accent/20 group-hover:scale-105 transition-transform">
              <Church className="w-5 h-5" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-semibold text-base sm:text-lg tracking-tight text-main line-clamp-1 group-hover:text-accent transition-colors">
              {displayChurchName}
            </span>
            {!isViewer && (
              <span className="text-[11px] text-mut font-medium -mt-1 hidden sm:block">
                Secretary Companion
              </span>
            )}
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="relative hidden lg:flex items-center gap-1 text-sm font-medium">
          {/* 1. Home */}
          <button
            onClick={() => handleNavClick('home')}
            data-nav-active={currentTab === 'home' ? 'true' : undefined}
            className={`relative group px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
              currentTab === 'home'
                ? 'bg-accent-tint text-accent font-semibold'
                : 'text-sec hover:text-main'
            }`}
          >
            <span>Home</span>
            <span className="nav-underline-bar absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
          </button>

          {/* 2. Calendar */}
          <button
            onClick={() => handleNavClick('calendar')}
            data-nav-active={currentTab === 'calendar' ? 'true' : undefined}
            className={`relative group px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
              currentTab === 'calendar'
                ? 'bg-accent-tint text-accent font-semibold'
                : 'text-sec hover:text-main'
            }`}
          >
            <span>Calendar</span>
            <span className="nav-underline-bar absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
          </button>

          {/* 3. Schedules (Viewer plain link) / Programs Dropdown (Secretary) */}
          {isViewer ? (
            <button
              onClick={() => handleNavClick('schedules')}
              data-nav-active={currentTab === 'schedules' ? 'true' : undefined}
              className={`relative group px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                currentTab === 'schedules'
                  ? 'bg-accent-tint text-accent font-semibold'
                  : 'text-sec hover:text-main'
              }`}
            >
              <span>Schedules</span>
              <span className="nav-underline-bar absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
            </button>
          ) : (
            <div className="relative" ref={servicesRef}>
              <button
                onClick={() => {
                  setServicesDropdownOpen(!servicesDropdownOpen);
                  setPeopleDropdownOpen(false);
                  setTasksDropdownOpen(false);
                }}
                data-nav-active={isServicesActive ? 'true' : undefined}
                className={`relative group flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  isServicesActive
                    ? 'bg-accent-tint text-accent font-semibold'
                    : 'text-sec hover:text-main'
                }`}
              >
                <span>Programs</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${servicesDropdownOpen ? 'rotate-180' : ''}`} />
                <span className="nav-underline-bar absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
              </button>

              {servicesDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-52 rounded-xl bg-surface border border-subtle shadow-dropdown py-1.5 z-50 motion-dropdown-in">
                  <button
                    onClick={() => handleNavClick('regular-services')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'regular-services'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-accent" />
                    <span>Services & Activities</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('schedules')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'schedules'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <Calendar className="w-4 h-4 text-accent" />
                    <span>Schedules</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4. Members & Ministries (Viewer direct link; Secretary Directory dropdown) */}
          {isViewer ? (
            <button
              onClick={() => handleNavClick('people-ministries')}
              data-nav-active={currentTab === 'people-ministries' ? 'true' : undefined}
              className={`relative group px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                currentTab === 'people-ministries'
                  ? 'bg-accent-tint text-accent font-semibold'
                  : 'text-sec hover:text-main'
              }`}
            >
              <span>Members & Ministries</span>
              <span className="nav-underline-bar absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
            </button>
          ) : (
            <div className="relative" ref={peopleRef}>
              <button
                onClick={() => {
                  setPeopleDropdownOpen(!peopleDropdownOpen);
                  setServicesDropdownOpen(false);
                  setTasksDropdownOpen(false);
                }}
                className={`relative group flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  isPeopleActive
                    ? 'bg-accent-tint text-accent font-semibold'
                    : 'text-sec hover:text-main'
                }`}
              >
                <span>Directory</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${peopleDropdownOpen ? 'rotate-180' : ''}`} />
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
              </button>

              {peopleDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-52 rounded-xl bg-surface border border-subtle shadow-dropdown py-1.5 z-50 motion-dropdown-in">
                  <button
                    onClick={() => handleNavClick('people-ministries')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'people-ministries'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <Users className="w-4 h-4 text-accent" />
                    <span>Members & Ministries</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('visitors')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'visitors'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 text-accent" />
                    <span>Visitors</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 5. Tasks Dropdown (Secretary only) */}
          {!isViewer && (
            <div className="relative" ref={tasksRef}>
              <button
                onClick={() => {
                  setTasksDropdownOpen(!tasksDropdownOpen);
                  setServicesDropdownOpen(false);
                  setPeopleDropdownOpen(false);
                }}
                className={`relative group flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  isTasksActive
                    ? 'bg-accent-tint text-accent font-semibold'
                    : 'text-sec hover:text-main'
                }`}
              >
                <span>Tasks</span>
                {newViewerNotesCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent text-accent-contrast tabular-nums leading-none"
                    title={`${newViewerNotesCount} new viewer note${newViewerNotesCount === 1 ? '' : 's'}`}
                  >
                    {newViewerNotesCount}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${tasksDropdownOpen ? 'rotate-180' : ''}`} />
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
              </button>

              {tasksDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-56 rounded-xl bg-surface border border-subtle shadow-dropdown py-1.5 z-50 motion-dropdown-in">
                  <button
                    onClick={() => handleNavClick('tasks')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'tasks'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 text-accent" />
                    <span>Tasks</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('quick-notes')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'quick-notes'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <StickyNote className="w-4 h-4 text-accent" />
                    <span>Quick Notes</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('viewer-notes')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      currentTab === 'viewer-notes'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Inbox className="w-4 h-4 text-accent" />
                      <span>Viewer Notes</span>
                    </span>
                    {newViewerNotesCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent text-accent-contrast tabular-nums leading-none">
                        {newViewerNotesCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleNavClick('forerunner-studio')}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors cursor-pointer ${
                      currentTab === 'forerunner-studio' || currentTab === 'sunday-school'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:text-main hover:bg-surface-hover'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-accent" />
                    <span>Forerunner Studio</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 6. Messaging (Secretary only) */}
          {!isViewer && (
            <button
              onClick={() => handleNavClick('message-templates')}
              className={`relative group px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                isMessagingActive
                  ? 'bg-accent-tint text-accent font-semibold'
                  : 'text-sec hover:text-main'
              }`}
            >
              <span>Messaging</span>
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
            </button>
          )}
          {/* Viewer sliding active nav underline (CSS anchor-positioned inside .viewer-motion) */}
          <span aria-hidden="true" className="viewer-nav-indicator" />
        </nav>

        {/* Right side: Live Header Clock, Settings (Secretary), User/Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Header Date and Time (Live isolated component) */}
          <HeaderLiveClock />

          {/* Viewer: Send a Note button (desktop/tablet header) */}
          {isViewer && onOpenViewerNote && (
            <button
              type="button"
              onClick={onOpenViewerNote}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
              title="Send a Note"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
              <span>Send a Note</span>
            </button>
          )}

          {/* Viewer: Facebook icon button between Send a Note and Display Preferences */}
          {isViewer && facebookHref && (
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full flex items-center justify-center text-sec hover:text-accent hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors cursor-pointer shrink-0"
              title="Facebook"
              aria-label="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
          )}

          {/* 7a. Viewer Device Appearance Picker (Viewer only — saved to localStorage only) */}
          {isViewer && (
            <div className="relative" ref={appearanceRef}>
              <button
                type="button"
                onClick={() => {
                  setAppearanceOpen(!appearanceOpen);
                  setServicesDropdownOpen(false);
                }}
                className={`relative group p-2 rounded-lg transition-colors text-sec hover:text-main hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  appearanceOpen ? 'bg-accent-tint text-accent' : ''
                }`}
                title="Display & Theme Preferences"
                aria-label="Display & Theme Preferences"
                aria-expanded={appearanceOpen}
              >
                <Palette className="w-4 h-4" />
              </button>

              {appearanceOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-subtle shadow-dropdown p-4 z-50 space-y-4 motion-dropdown-in">
                  <div className="flex items-center justify-between pb-2 border-b border-subtle">
                    <span className="text-xs font-bold uppercase tracking-wider text-main">
                      Display Preferences
                    </span>
                    <span className="text-[10px] text-mut">This device only</span>
                  </div>

                  {/* 1. Color Scheme Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-sec block">Color scheme</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'light' as ColorScheme, label: 'Light', Icon: Sun },
                          { id: 'dark' as ColorScheme, label: 'Dark', Icon: Moon },
                        ]
                      ).map(({ id, label, Icon }) => {
                        const selected = activeAppearance.colorScheme === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleViewerPrefChange({ colorScheme: id })}
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'border-accent bg-accent-tint text-accent font-semibold'
                                : 'border-subtle bg-field text-main hover:bg-surface-hover'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Theme Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-sec block">Theme</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {THEME_CATALOGUE.map((t) => {
                        const selected = activeAppearance.theme === t.id;
                        const palette = activeAppearance.colorScheme === 'dark' ? t.dark : t.light;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleViewerPrefChange({ theme: t.id })}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'border-accent bg-accent-tint text-accent font-semibold'
                                : 'border-subtle bg-field text-main hover:bg-surface-hover'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0"
                              style={{ backgroundColor: palette.page, borderColor: palette.border }}
                            >
                              <span
                                className="w-2 h-2 rounded-xs border"
                                style={{ backgroundColor: palette.card, borderColor: palette.border }}
                              />
                            </span>
                            <span className="truncate">{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Accent Color Selector */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-sec block">Accent Color</span>
                    <div className="flex items-center justify-between gap-1.5">
                      {ACCENT_CATALOGUE.map((a) => {
                        const selected = settings.accentColor === a.id;
                        const swatchHex = activeAppearance.colorScheme === 'dark' ? a.swatchDark : a.swatchLight;
                        const checkColor = activeAppearance.colorScheme === 'dark' ? a.checkDarkScheme : a.checkLightScheme;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleViewerPrefChange({ accentColor: a.id })}
                            title={a.label}
                            aria-label={a.label}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-offset-2 ring-offset-surface ring-accent border-strong scale-105'
                                : 'border-subtle hover:scale-105'
                            }`}
                            style={{ backgroundColor: swatchHex }}
                          >
                            {selected && (
                              <Check className="w-4 h-4" style={{ color: checkColor }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Secretary: Facebook icon button just before Settings */}
          {!isViewer && facebookHref && (
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full flex items-center justify-center text-sec hover:text-accent hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors cursor-pointer shrink-0"
              title="Facebook"
              aria-label="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
          )}

          {/* 7. Settings Icon (Secretary only) */}
          {!isViewer && (
            <button
              onClick={() => handleNavClick('settings')}
              className={`relative group p-2 rounded-lg transition-colors text-sec hover:text-main hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                currentTab === 'settings' ? 'bg-accent-tint text-accent' : ''
              }`}
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] bg-accent rounded-full transition-all duration-150 ease-out w-0 group-hover:w-3/4 group-focus-visible:w-3/4 pointer-events-none" />
            </button>
          )}

          {/* User Profile / Visible Log out */}
          <div className="hidden sm:flex pl-2 ml-1 border-l border-subtle items-center gap-2">
            {!isViewer && (
              <span className="text-xs text-sec font-medium max-w-[90px] truncate" title={username}>
                {username}
              </span>
            )}
            <button
              onClick={logout}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sec hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex lg:hidden items-center gap-1">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-sec hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-subtle bg-surface px-4 pt-2 pb-6 space-y-1.5 shadow-lg motion-notice-in max-h-[85vh] overflow-y-auto">
          {/* Mobile 1. Home */}
          <button
            onClick={() => handleNavClick('home')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'home' ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>

          {/* Mobile 2. Calendar */}
          <button
            onClick={() => handleNavClick('calendar')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'calendar' ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Calendar</span>
          </button>

          {/* Mobile 3. Schedules (Viewer plain link) / Programs (Secretary) */}
          {isViewer ? (
            <button
              onClick={() => handleNavClick('schedules')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'schedules' ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Schedules</span>
            </button>
          ) : (
            <div>
              <button
                onClick={() => setMobileServicesExpanded(!mobileServicesExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isServicesActive ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4" />
                  <span>Programs</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${mobileServicesExpanded ? 'rotate-180' : ''}`} />
              </button>
              {mobileServicesExpanded && (
                <div className="pl-9 pr-3 py-1 space-y-1">
                  <button
                    onClick={() => handleNavClick('regular-services')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm transition-colors ${
                      currentTab === 'regular-services' ? 'text-accent font-semibold bg-accent-tint/50' : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    Services & Activities
                  </button>
                  <button
                    onClick={() => handleNavClick('schedules')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm transition-colors ${
                      currentTab === 'schedules' ? 'text-accent font-semibold bg-accent-tint/50' : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    Schedules
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile 4. Members & Ministries */}
          {isViewer ? (
            <button
              onClick={() => handleNavClick('people-ministries')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'people-ministries' ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Members & Ministries</span>
            </button>
          ) : (
            <div>
              <button
                onClick={() => setMobilePeopleExpanded(!mobilePeopleExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isPeopleActive ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4" />
                  <span>Directory</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${mobilePeopleExpanded ? 'rotate-180' : ''}`} />
              </button>
              {mobilePeopleExpanded && (
                <div className="pl-9 pr-3 py-1 space-y-1">
                  <button
                    onClick={() => handleNavClick('people-ministries')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm transition-colors ${
                      currentTab === 'people-ministries' ? 'text-accent font-semibold bg-accent-tint/50' : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    Members & Ministries
                  </button>
                  <button
                    onClick={() => handleNavClick('visitors')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm transition-colors ${
                      currentTab === 'visitors' ? 'text-accent font-semibold bg-accent-tint/50' : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    Visitors
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile 5. Tasks (Secretary only) */}
          {!isViewer && (
            <div>
              <button
                onClick={() => setMobileTasksExpanded(!mobileTasksExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isTasksActive ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CheckSquare className="w-4 h-4" />
                  <span>Tasks</span>
                  {newViewerNotesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent text-accent-contrast tabular-nums leading-none">
                      {newViewerNotesCount}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${mobileTasksExpanded ? 'rotate-180' : ''}`} />
              </button>
              {mobileTasksExpanded && (
                <div className="pl-9 pr-3 py-1 space-y-1">
                  <button
                    onClick={() => handleNavClick('tasks')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm flex items-center gap-2.5 transition-colors ${
                      currentTab === 'tasks'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 text-accent" />
                    <span>Tasks</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('quick-notes')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm flex items-center gap-2.5 transition-colors ${
                      currentTab === 'quick-notes'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    <StickyNote className="w-4 h-4 text-accent" />
                    <span>Quick Notes</span>
                  </button>
                  <button
                    onClick={() => handleNavClick('viewer-notes')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm flex items-center justify-between gap-2 transition-colors ${
                      currentTab === 'viewer-notes'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Inbox className="w-4 h-4 text-accent" />
                      <span>Viewer Notes</span>
                    </span>
                    {newViewerNotesCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent text-accent-contrast tabular-nums leading-none">
                        {newViewerNotesCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleNavClick('forerunner-studio')}
                    className={`w-full text-left py-2 px-3 rounded-md text-sm flex items-center gap-2.5 transition-colors ${
                      currentTab === 'forerunner-studio' || currentTab === 'sunday-school'
                        ? 'bg-accent-tint text-accent font-semibold'
                        : 'text-sec hover:bg-surface-hover'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-accent" />
                    <span>Forerunner Studio</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile Viewer: Send a Note */}
          {isViewer && onOpenViewerNote && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenViewerNote();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-accent-tint text-accent hover:opacity-90 transition-opacity cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Send a Note</span>
            </button>
          )}

          {/* Mobile 6. Messaging (Secretary only) */}
          {!isViewer && (
            <button
              onClick={() => handleNavClick('message-templates')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isMessagingActive ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Messaging</span>
            </button>
          )}

          {/* Mobile 7. Settings (Secretary only) */}
          {!isViewer && (
            <button
              onClick={() => handleNavClick('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'settings' ? 'bg-accent-tint text-accent font-semibold' : 'text-sec hover:bg-surface-hover'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}

          {/* Mobile User Profile & Logout */}
          <div className="pt-3 border-t border-subtle flex items-center justify-between px-3">
            {!isViewer ? (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-sec" />
                <span className="text-sm font-medium text-main">{username}</span>
              </div>
            ) : (
              <div />
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
