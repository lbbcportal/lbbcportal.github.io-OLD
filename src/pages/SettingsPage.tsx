import React, { useState, useRef, useEffect } from 'react';
import {
  Church,
  Upload,
  Trash2,
  Check,
  Lock,
  LogOut,
  Calendar,
  Clock,
  Sparkles,
  Palette,
  AlertCircle,
  CheckCircle2,
  Facebook,
  MessageCircle,
  Image as ImageIcon,
  BookOpen,
  Shield,
  Eye,
  EyeOff,
  RefreshCw,
  KeyRound,
  Users,
  Sun,
  Moon
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { compressImage, compressBannerImage, compressLoginBackgroundImage } from '../lib/imageCompressor';
import {
  THEME_CATALOGUE,
  ACCENT_CATALOGUE,
  normalizeAppearance
} from '../lib/themes';
import { ColorScheme, ThemeBase, AccentColor, WeekStartDay, TimeFormat, ClockStyle, ClockColor, IdleTimeoutMinutes } from '../types';
import { Spinner } from '../components/LoadingIndicator';
import { DataBackupSection } from '../components/DataBackupSection';

const IDLE_TIMEOUT_OPTIONS: { value: IdleTimeoutMinutes; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
  { value: 120, label: '120 min' },
];

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    bannerImage,
    updateBannerImage,
    loginBackground,
    updateLoginBackground,
    viewerSettings,
    updateViewerSettings,
    rebuildPeoplePublic,
  } = useData();
  const { logout, changePassword, username } = useAuth();

  // Viewer Access settings local state
  const [showPasscode, setShowPasscode] = useState(false);
  const [isEditingPasscode, setIsEditingPasscode] = useState(false);
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [savingViewerSettings, setSavingViewerSettings] = useState(false);
  const [savingIdleSettings, setSavingIdleSettings] = useState(false);
  const [idleSavedMsg, setIdleSavedMsg] = useState<string | null>(null);
  const [rebuildingViewerCopy, setRebuildingViewerCopy] = useState(false);
  const [rebuildSuccessMsg, setRebuildSuccessMsg] = useState<string | null>(null);

  const [churchNameInput, setChurchNameInput] = useState(settings.churchName);
  const [secretaryNameInput, setSecretaryNameInput] = useState(settings.secretaryName || '');
  const [facebookInput, setFacebookInput] = useState(settings.facebookLink || '');
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const [loginBgUploading, setLoginBgUploading] = useState(false);
  const [loginBgError, setLoginBgError] = useState<string | null>(null);
  const loginBgFileInputRef = useRef<HTMLInputElement>(null);
  const [dimmingDraft, setDimmingDraft] = useState<number>(loginBackground.dimming);

  const [messengerInput, setMessengerInput] = useState(settings.messengerChatLink || '');
  const [messengerError, setMessengerError] = useState<string | null>(null);

  useEffect(() => {
    setChurchNameInput(settings.churchName);
  }, [settings.churchName]);

  useEffect(() => {
    setSecretaryNameInput(settings.secretaryName || '');
  }, [settings.secretaryName]);

  useEffect(() => {
    setFacebookInput(settings.facebookLink || '');
  }, [settings.facebookLink]);

  useEffect(() => {
    setMessengerInput(settings.messengerChatLink || '');
  }, [settings.messengerChatLink]);

  useEffect(() => {
    setDimmingDraft(loginBackground.dimming);
  }, [loginBackground.dimming]);

  // Facebook link validation and save
  const handleFacebookBlur = () => {
    const trimmed = facebookInput.trim();
    if (!trimmed) {
      setFacebookError(null);
      if (settings.facebookLink) {
        updateSettings({ facebookLink: '' });
      }
      return;
    }

    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    try {
      const url = new URL(normalized);
      if (!url.hostname || !url.hostname.includes('.')) {
        setFacebookError('Please enter a valid web address (e.g. facebook.com/yourchurch)');
        return;
      }
      setFacebookError(null);
      setFacebookInput(normalized);
      if (normalized !== settings.facebookLink) {
        updateSettings({ facebookLink: normalized });
      }
    } catch {
      setFacebookError('Please enter a valid web address');
    }
  };

  // Messenger group chat link validation and save
  const handleMessengerBlur = () => {
    const trimmed = messengerInput.trim();
    if (!trimmed) {
      setMessengerError(null);
      if (settings.messengerChatLink) {
        updateSettings({ messengerChatLink: '' });
      }
      return;
    }

    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    try {
      const url = new URL(normalized);
      if (!url.hostname || !url.hostname.includes('.')) {
        setMessengerError('Please enter a valid web address (e.g. m.me/group or messenger.com)');
        return;
      }
      setMessengerError(null);
      setMessengerInput(normalized);
      if (normalized !== settings.messengerChatLink) {
        updateSettings({ messengerChatLink: normalized });
      }
    } catch {
      setMessengerError('Please enter a valid web address');
    }
  };

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Name save
  const handleNameBlur = () => {
    if (churchNameInput.trim() && churchNameInput !== settings.churchName) {
      updateSettings({ churchName: churchNameInput.trim() });
    }
  };

  const handleSaveSecretaryName = () => {
    const trimmed = secretaryNameInput.trim();
    if (trimmed !== secretaryNameInput) {
      setSecretaryNameInput(trimmed);
    }
    if (trimmed !== (settings.secretaryName || '')) {
      updateSettings({ secretaryName: trimmed });
    }
  };

  // Logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    try {
      const compressedDataUrl = await compressImage(file, 256, 0.85);
      await updateSettings({ churchLogo: compressedDataUrl });
    } catch (err) {
      console.error('Failed to compress/save logo:', err);
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    await updateSettings({ churchLogo: '' });
  };

  // Banner upload (compresses up to 1600px, 0.75 quality, under ~600KB, stored in separate Firestore doc settings/banner)
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBannerUploading(true);
    setBannerError(null);
    try {
      const { dataUrl, sizeKb, isTooLarge } = await compressBannerImage(file);
      if (isTooLarge) {
        setBannerError(`Image is still too large (${sizeKb} KB after compression). Please select a photo under 600 KB.`);
        return;
      }
      await updateBannerImage(dataUrl);
    } catch (err) {
      console.error('Failed to compress/save banner:', err);
      setBannerError('Failed to process image. Please try another image.');
    } finally {
      setBannerUploading(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handleRemoveBanner = async () => {
    setBannerError(null);
    await updateBannerImage('');
  };

  // Login screen background upload (max 1920px, JPEG ~0.8, target <600KB, refuse >800KB)
  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.type && !allowedTypes.includes(file.type)) {
      setLoginBgError('Please choose a JPG, PNG, or WebP image.');
      if (loginBgFileInputRef.current) loginBgFileInputRef.current.value = '';
      return;
    }

    setLoginBgUploading(true);
    setLoginBgError(null);
    try {
      const { dataUrl, width, height, sizeKb, isTooLarge } = await compressLoginBackgroundImage(file);
      if (isTooLarge) {
        setLoginBgError(
          `Image is still ${sizeKb} KB after compression (maximum is about 800 KB). Please select a smaller or simpler image.`
        );
        return;
      }
      await updateLoginBackground({
        imageData: dataUrl,
        width,
        height,
        dimming: dimmingDraft,
      });
    } catch (err) {
      console.error('Failed to compress/save login background:', err);
      setLoginBgError('Could not process that image. Please try another JPG, PNG, or WebP photo.');
    } finally {
      setLoginBgUploading(false);
      if (loginBgFileInputRef.current) loginBgFileInputRef.current.value = '';
    }
  };

  const handleRemoveLoginBg = async () => {
    setLoginBgError(null);
    await updateLoginBackground({ imageData: '', width: 0, height: 0 });
  };

  const handleUseDefaultLoginBg = async () => {
    setLoginBgError(null);
    setDimmingDraft(20);
    await updateLoginBackground({ imageData: '', width: 0, height: 0, dimming: 20 });
  };

  const commitLoginDimming = async (nextDimming: number) => {
    const clamped = Math.max(0, Math.min(60, Math.round(nextDimming)));
    setDimmingDraft(clamped);
    if (clamped !== loginBackground.dimming) {
      await updateLoginBackground({ dimming: clamped });
    }
  };

  // Password update
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(newPassword);
      setPasswordSuccess('Password successfully updated!');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  // Viewer Access handlers
  const handleSelectViewerMode = async (mode: 'open' | 'passcode') => {
    if (savingViewerSettings || viewerSettings.mode === mode) return;
    setSavingViewerSettings(true);
    try {
      await updateViewerSettings({ mode });
    } finally {
      setSavingViewerSettings(false);
    }
  };

  const handleGeneratePasscode = async () => {
    if (savingViewerSettings) return;
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const code = String(arr[0] % 1000000).padStart(6, '0');
    setPasscodeError(null);
    setSavingViewerSettings(true);
    try {
      await updateViewerSettings({ passcode: code });
      setShowPasscode(true);
      setIsEditingPasscode(false);
      setPasscodeDraft('');
    } finally {
      setSavingViewerSettings(false);
    }
  };

  const handleSaveCustomPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = passcodeDraft.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleaned)) {
      setPasscodeError('Passcode must be exactly 6 digits (0–9).');
      return;
    }
    setPasscodeError(null);
    setSavingViewerSettings(true);
    try {
      await updateViewerSettings({ passcode: cleaned });
      setIsEditingPasscode(false);
      setPasscodeDraft('');
    } finally {
      setSavingViewerSettings(false);
    }
  };

  const handleRebuildViewerCopy = async () => {
    if (rebuildingViewerCopy) return;
    setRebuildingViewerCopy(true);
    setRebuildSuccessMsg(null);
    try {
      const count = await rebuildPeoplePublic();
      setRebuildSuccessMsg(`Synced ${count} ${count === 1 ? 'member' : 'members'} to viewer copy.`);
      setTimeout(() => setRebuildSuccessMsg(null), 4000);
    } finally {
      setRebuildingViewerCopy(false);
    }
  };

  const activeAppearance = normalizeAppearance(settings.theme, settings.colorScheme);
  const totalAppearanceCombinations = THEME_CATALOGUE.length * 2 * ACCENT_CATALOGUE.length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 motion-page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-main">App Settings</h1>
        <p className="text-sm text-sec mt-1">
          Customize church identity, theme appearance, regional scheduling, and security credentials.
        </p>
      </div>

      {/* Church Identity Section */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-6">
        <h2 className="text-base font-semibold text-main flex items-center gap-2">
          <Church className="w-4 h-4 text-accent" />
          <span>Church Identity</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Church Name
            </label>
            <input
              type="text"
              value={churchNameInput}
              onChange={(e) => setChurchNameInput(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g. Grace Fellowship Church"
              className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            <span className="text-xs text-mut mt-1.5 block">
              Displayed in the navigation header, welcome banner, and printed rosters.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Church Logo
            </label>
            <div className="flex items-center gap-4">
              {settings.churchLogo ? (
                <div className="relative group">
                  <img
                    src={settings.churchLogo}
                    alt="Church Logo"
                    className="w-16 h-16 rounded-xl object-contain border border-subtle bg-subtle p-1"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 p-1 rounded-full bg-red-600 text-white shadow-xs hover:bg-red-700 transition-colors"
                    title="Remove logo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-subtle bg-subtle flex items-center justify-center text-mut">
                  <Church className="w-7 h-7" />
                </div>
              )}

              <div className="flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {logoUploading ? (
                    <>
                      <Spinner size="xs" variant="accent" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-accent" />
                      <span>Upload Logo Image</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] text-mut block mt-1">
                  PNG or JPEG. Automatically resized and compressed before saving.
                </span>
              </div>
            </div>
          </div>

          {/* Facebook link field */}
          <div className="sm:col-span-2 pt-4 border-t border-subtle">
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Facebook className="w-3.5 h-3.5 text-accent" />
              <span>Facebook page / profile link</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={facebookInput}
                onChange={(e) => {
                  setFacebookInput(e.target.value);
                  if (facebookError) setFacebookError(null);
                }}
                onBlur={handleFacebookBlur}
                placeholder="e.g. facebook.com/FirstCommunityChurch"
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-field text-main text-sm focus:outline-none focus:ring-2 ${
                  facebookError
                    ? 'border-red-500 focus:ring-red-400/40 focus:border-red-500'
                    : 'border-subtle focus:ring-accent/40 focus:border-accent'
                }`}
              />
              {facebookInput && (
                <button
                  type="button"
                  onClick={() => {
                    setFacebookInput('');
                    setFacebookError(null);
                    updateSettings({ facebookLink: '' });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mut hover:text-main px-2 py-1 rounded bg-subtle/50 hover:bg-subtle transition-colors cursor-pointer"
                  title="Clear Facebook link"
                >
                  Clear
                </button>
              )}
            </div>
            {facebookError ? (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{facebookError}</span>
              </p>
            ) : (
              <span className="text-xs text-mut mt-1.5 block">
                Direct link to your church's Facebook page or group. Opens from the Home page banner.
              </span>
            )}
          </div>

          {/* Messenger group chat link field */}
          <div className="sm:col-span-2 pt-4 border-t border-subtle">
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-accent" />
              <span>Messenger group chat link</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={messengerInput}
                onChange={(e) => {
                  setMessengerInput(e.target.value);
                  if (messengerError) setMessengerError(null);
                }}
                onBlur={handleMessengerBlur}
                placeholder="e.g. m.me/yourgroup or https://www.messenger.com/t/..."
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-field text-main text-sm focus:outline-none focus:ring-2 ${
                  messengerError
                    ? 'border-red-500 focus:ring-red-400/40 focus:border-red-500'
                    : 'border-subtle focus:ring-accent/40 focus:border-accent'
                }`}
              />
              {messengerInput && (
                <button
                  type="button"
                  onClick={() => {
                    setMessengerInput('');
                    setMessengerError(null);
                    updateSettings({ messengerChatLink: '' });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mut hover:text-main px-2 py-1 rounded bg-subtle/50 hover:bg-subtle transition-colors cursor-pointer"
                  title="Clear Messenger link"
                >
                  Clear
                </button>
              )}
            </div>
            {messengerError ? (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{messengerError}</span>
              </p>
            ) : (
              <span className="text-xs text-mut mt-1.5 block">
                Link to your church or ministry Messenger group chat. Used by the "Copy and open Messenger" button in reminders.
              </span>
            )}
          </div>

          {/* Home Banner Image field */}
          <div className="sm:col-span-2 pt-4 border-t border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                <span>Home Banner Image</span>
              </label>
              {bannerImage && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Image</span>
                </button>
              )}
            </div>

            {/* Banner Preview */}
            <div className="relative overflow-hidden rounded-2xl border border-subtle h-36 sm:h-44 w-full bg-subtle flex items-center justify-center">
              {bannerImage ? (
                <>
                  <img
                    src={bannerImage}
                    alt="Home Banner Preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-end p-4 pointer-events-none">
                    <span className="text-white text-xs font-semibold px-2 py-1 rounded bg-black/60 backdrop-blur-xs">
                      Live Banner Preview
                    </span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-main text-center relative bg-surface">
                  <div className="absolute inset-0 bg-accent-tint-strong pointer-events-none" />
                  <div className="relative z-10 flex flex-col items-center">
                    <ImageIcon className="w-8 h-8 opacity-60 mb-2 text-accent" />
                    <span className="text-sm font-semibold">No custom banner image set</span>
                    <span className="text-xs text-sec mt-0.5">
                      The Home dashboard will display a plain accent-tinted banner
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <input
                type="file"
                ref={bannerFileInputRef}
                onChange={handleBannerUpload}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <button
                type="button"
                disabled={bannerUploading}
                onClick={() => bannerFileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {bannerUploading ? (
                  <>
                    <Spinner size="xs" variant="accent" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 text-accent" />
                    <span>Upload Banner Image</span>
                  </>
                )}
              </button>
              <span className="text-[11px] text-mut">
                Stored in its own document. Automatically compressed (max 1600px wide, ~0.75 JPEG, under 600 KB).
              </span>
            </div>

            {bannerError && (
              <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{bannerError}</span>
              </p>
            )}
          </div>

          {/* Login Screen Background field */}
          <div className="sm:col-span-2 pt-4 border-t border-subtle space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                <span>Login screen background</span>
              </label>
              <span className="text-[11px] text-mut">
                {loginBackground.imageData
                  ? loginBackground.width && loginBackground.height
                    ? `${loginBackground.width} × ${loginBackground.height}`
                    : 'Custom image active'
                  : 'Default navy gradient'}
              </span>
            </div>

            {/* Small Preview */}
            <div className="relative overflow-hidden rounded-2xl border border-subtle h-32 sm:h-36 w-full max-w-md login-bg-navy flex items-center justify-center">
              {loginBackground.imageData ? (
                <>
                  <img
                    src={loginBackground.imageData}
                    alt="Login Screen Background Preview"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: `rgba(0, 0, 0, ${dimmingDraft / 100})` }}
                  />
                </>
              ) : (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full blur-2xl opacity-45 bg-sky-500/25 pointer-events-none" />
              )}

              {/* Miniature card preview for contrast reference */}
              <div className="relative z-10 flex flex-col items-center gap-1.5 px-4 text-center pointer-events-none">
                <span
                  className="text-[11px] font-bold text-white tracking-tight"
                  style={
                    loginBackground.imageData
                      ? { textShadow: '0 1px 6px rgba(0, 0, 0, 0.75)' }
                      : undefined
                  }
                >
                  {settings.churchName || 'Our Church'}
                </span>
                <div className="rounded-lg bg-slate-900/65 backdrop-blur-md border border-white/15 px-4 py-1.5 shadow-md">
                  <span className="text-[10px] font-medium text-slate-200">
                    {loginBackground.imageData ? 'Custom background preview' : 'Default navy gradient'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Upload / Replace, Remove, Use default */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <input
                type="file"
                ref={loginBgFileInputRef}
                onChange={handleLoginBgUpload}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <button
                type="button"
                disabled={loginBgUploading}
                onClick={() => loginBgFileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {loginBgUploading ? (
                  <>
                    <Spinner size="xs" variant="accent" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 text-accent" />
                    <span>{loginBackground.imageData ? 'Replace' : 'Upload image'}</span>
                  </>
                )}
              </button>

              {loginBackground.imageData && (
                <button
                  type="button"
                  disabled={loginBgUploading}
                  onClick={handleRemoveLoginBg}
                  className="px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-surface hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}

              <button
                type="button"
                disabled={loginBgUploading || (!loginBackground.imageData && loginBackground.dimming === 20)}
                onClick={handleUseDefaultLoginBg}
                className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-45 disabled:cursor-default"
              >
                <RefreshCw className="w-3.5 h-3.5 text-sec" />
                <span>Use default</span>
              </button>
            </div>

            {/* Image dimming slider (0% to 60%, default 20%) */}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="login-bg-dimming" className="font-semibold text-main">
                  Image dimming
                </label>
                <span className="font-semibold text-sec tabular-nums">{dimmingDraft}%</span>
              </div>
              <input
                id="login-bg-dimming"
                type="range"
                min={0}
                max={60}
                step={1}
                value={dimmingDraft}
                onChange={(e) => setDimmingDraft(Number(e.target.value))}
                onPointerUp={(e) => commitLoginDimming(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commitLoginDimming(Number((e.target as HTMLInputElement).value))}
                onBlur={(e) => commitLoginDimming(Number((e.target as HTMLInputElement).value))}
                className="w-full accent-[var(--accent-base)] cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] text-mut">
                <span>0% (No overlay)</span>
                <span>20% (Default)</span>
                <span>60% (Darkest)</span>
              </div>
            </div>

            <span className="text-[11px] text-mut block">
              JPG, PNG, or WebP. Resized to max 1920px wide and compressed to JPEG (~0.8) under 600 KB before saving.
            </span>

            {loginBgError && (
              <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{loginBgError}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Appearance Section (Color Scheme, Theme Catalogue & Accent Color) */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-main flex items-center gap-2">
            <Palette className="w-4 h-4 text-accent" />
            <span>Appearance</span>
          </h2>
          <span className="text-xs text-mut font-medium">
            {totalAppearanceCombinations} Theme, Scheme &amp; Accent Combinations
          </span>
        </div>

        {/* 1. Color Scheme */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-main uppercase tracking-wider">
              Color scheme
            </span>
            <span className="text-xs text-mut">Applies immediately</span>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            {(
              [
                { id: 'light' as ColorScheme, label: 'Light', Icon: Sun },
                { id: 'dark' as ColorScheme, label: 'Dark', Icon: Moon },
              ]
            ).map(({ id, label, Icon }) => {
              const isSelected = activeAppearance.colorScheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateSettings({ colorScheme: id })}
                  className={`px-4 py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-accent ring-2 ring-accent/30 bg-accent-tint/30'
                      : 'border-subtle hover:border-strong bg-field'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-accent' : 'text-sec'}`} />
                    <span className="font-semibold text-sm text-main">{label}</span>
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Theme Catalogue */}
        <div className="pt-5 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-main uppercase tracking-wider">
              Theme
            </span>
            <span className="text-xs text-mut">
              Showing {activeAppearance.colorScheme === 'dark' ? 'Dark' : 'Light'} palettes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
            {THEME_CATALOGUE.map((t) => {
              const isSelected = activeAppearance.theme === t.id;
              const palette = activeAppearance.colorScheme === 'dark' ? t.dark : t.light;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSettings({ theme: t.id })}
                  className={`p-3.5 rounded-xl border text-left transition-all h-full flex flex-col items-start justify-start cursor-pointer ${
                    isSelected
                      ? 'border-accent ring-2 ring-accent/30 bg-accent-tint/30'
                      : 'border-subtle hover:border-strong bg-field'
                  }`}
                >
                  <div className="flex items-center justify-between w-full h-6 mb-2.5">
                    <span className="font-semibold text-sm text-main">{t.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </div>

                  {/* Mini Theme Swatch Preview (Page -> Card -> Field + Text) */}
                  <div
                    className="w-full h-12 rounded-lg p-1.5 mb-2.5 shrink-0 flex items-center gap-1.5 border"
                    style={{
                      backgroundColor: palette.page,
                      borderColor: palette.border,
                    }}
                  >
                    <div
                      className="flex-1 h-full rounded-md border px-2 py-1 flex flex-col justify-between"
                      style={{
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-8 rounded-full"
                          style={{ backgroundColor: palette.text }}
                        />
                        <span
                          className="h-1.5 w-4 rounded-full"
                          style={{ backgroundColor: palette.muted }}
                        />
                      </div>
                      <div
                        className="h-2.5 w-full rounded border"
                        style={{
                          backgroundColor: palette.field,
                          borderColor: palette.border,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-h-[34px] flex items-start">
                    <span className="text-xs text-mut leading-snug">{t.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Accent Color */}
        <div className="pt-5 border-t border-subtle space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Accent Color</span>
            </h3>
            <span className="text-xs text-mut">
              Contrast-adjusted for {activeAppearance.colorScheme === 'dark' ? 'Dark' : 'Light'} mode
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch">
            {ACCENT_CATALOGUE.map((acc) => {
              const isSelected = settings.accentColor === acc.id;
              const swatchHex = activeAppearance.colorScheme === 'dark' ? acc.swatchDark : acc.swatchLight;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => updateSettings({ accentColor: acc.id })}
                  className={`p-3.5 rounded-xl border text-left transition-all h-full flex flex-col items-start justify-start cursor-pointer ${
                    isSelected
                      ? 'border-accent ring-2 ring-accent/30 bg-accent-tint/30'
                      : 'border-subtle hover:border-strong bg-field'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1 min-h-[24px] mb-2.5">
                    <span className="font-semibold text-[13px] text-main leading-tight">{acc.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-accent shrink-0" />}
                  </div>
                  <div
                    className="w-full h-10 rounded-lg mb-2.5 shrink-0 shadow-xs border border-subtle"
                    style={{ backgroundColor: swatchHex }}
                  />
                  <div className="flex-1 min-h-[36px] flex items-start">
                    <span className="text-[11px] text-mut leading-snug">{acc.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Date & Time Preferences */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-6">
        <h2 className="text-base font-semibold text-main flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          <span>Regional & Calendar Preferences</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Week Starts On
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['sunday', 'monday'] as WeekStartDay[]).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => updateSettings({ weekStartDay: day })}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-all cursor-pointer ${
                    settings.weekStartDay === day
                      ? 'border-accent bg-accent text-accent-contrast font-semibold shadow-xs'
                      : 'border-subtle bg-surface text-sec hover:bg-surface-hover'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <span className="text-xs text-mut mt-1.5 block">
              Controls calendar column layout and weekly roster generation.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Time Display Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['12h', '24h'] as TimeFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => updateSettings({ timeFormat: fmt })}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    settings.timeFormat === fmt
                      ? 'border-accent bg-accent text-accent-contrast font-semibold shadow-xs'
                      : 'border-subtle bg-surface text-sec hover:bg-surface-hover'
                  }`}
                >
                  {fmt === '12h' ? '12-Hour (e.g. 10:30 AM)' : '24-Hour (e.g. 10:30)'}
                </button>
              ))}
            </div>
            <span className="text-xs text-mut mt-1.5 block">
              All dates and times are displayed in your device's local timezone.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Clock style
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['digital', 'analog'] as ClockStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => updateSettings({ clockStyle: style })}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-all cursor-pointer ${
                    (settings.clockStyle || 'digital') === style
                      ? 'border-accent bg-accent text-accent-contrast font-semibold shadow-xs'
                      : 'border-subtle bg-surface text-sec hover:bg-surface-hover'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            <span className="text-xs text-mut mt-1.5 block">
              Chooses the Home banner clock display for everyone.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Banner text color
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['white', 'black'] as ClockColor[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSettings({ clockColor: color })}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-all cursor-pointer ${
                    (settings.clockColor || 'white') === color
                      ? 'border-accent bg-accent text-accent-contrast font-semibold shadow-xs'
                      : 'border-subtle bg-surface text-sec hover:bg-surface-hover'
                  }`}
                >
                  {color}
                </button>
              ))}
            </div>
            <span className="text-xs text-mut mt-1.5 block">
              Pick White or Black to contrast all text and the clock on your Home banner.
            </span>
          </div>

          {/* Show Daily Bible Verse Toggle */}
          <div className="sm:col-span-2 pt-4 border-t border-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>Show daily Bible verse</span>
              </label>
              <p className="text-xs text-mut">
                Displays an inspirational KJV Bible verse on the Home dashboard that changes each day.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showDailyVerse !== false}
                onChange={(e) => updateSettings({ showDailyVerse: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-strong after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent border border-subtle"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Account Security & Password Change */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-6">
        <h2 className="text-base font-semibold text-main flex items-center gap-2">
          <Lock className="w-4 h-4 text-accent" />
          <span>Secretary Account & Security</span>
        </h2>

        <div className="flex items-center justify-between pb-4 border-b border-subtle">
          <div>
            <span className="text-xs text-mut uppercase font-semibold">Active Username</span>
            <div className="text-base font-bold text-main">{username}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="max-w-md space-y-1.5 pb-4 border-b border-subtle">
          <label
            htmlFor="secretary-greeting-name"
            className="block text-xs font-semibold text-main uppercase tracking-wider"
          >
            Your name (used in greetings)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="secretary-greeting-name"
              type="text"
              value={secretaryNameInput}
              onChange={(e) => setSecretaryNameInput(e.target.value)}
              onBlur={handleSaveSecretaryName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveSecretaryName();
                }
              }}
              placeholder="e.g. Sis. Anna"
              maxLength={60}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
            {secretaryNameInput.trim() !== (settings.secretaryName || '') && (
              <button
                type="button"
                onClick={handleSaveSecretaryName}
                className="px-3.5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                Save
              </button>
            )}
          </div>
          <span className="text-xs text-mut block">
            Optional. Appears in the Home greeting banner (leave blank to greet without a name).
          </span>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <h3 className="text-sm font-semibold text-main">Change Password</h3>

          {passwordSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {savingPassword ? (
              <>
                <Spinner size="xs" variant="contrast" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Update Password</span>
            )}
          </button>
        </form>

        {/* Automatic Idle Logout (Settings > Security) */}
        <div className="pt-6 border-t border-subtle space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-main flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                <span>Security · Automatic Idle Logout</span>
              </h3>
              <p className="text-xs text-mut mt-0.5 max-w-xl">
                Automatically log out after inactivity with a 60-second warning. Never logs out while a save, AI request, or file download is running.
              </p>
            </div>
            {savingIdleSettings ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-sec font-medium">
                <Spinner size="xs" variant="accent" />
                <span>Saving...</span>
              </span>
            ) : idleSavedMsg ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{idleSavedMsg}</span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Secretary Idle Timeout */}
            <div className="p-4 rounded-xl bg-subtle/60 border border-subtle space-y-2.5">
              <div>
                <span className="text-xs font-semibold text-main uppercase tracking-wider block">
                  Secretary Idle Timeout
                </span>
                <span className="text-[11px] text-mut">Default: 60 minutes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {IDLE_TIMEOUT_OPTIONS.map((opt) => {
                  const current = typeof viewerSettings.secretaryIdleMinutes === 'number'
                    ? viewerSettings.secretaryIdleMinutes
                    : 60;
                  const selected = current === opt.value;
                  return (
                    <button
                      key={`sec-${opt.value}`}
                      type="button"
                      disabled={savingIdleSettings}
                      onClick={async () => {
                        if (selected) return;
                        setSavingIdleSettings(true);
                        setIdleSavedMsg(null);
                        try {
                          await updateViewerSettings({ secretaryIdleMinutes: opt.value });
                          setIdleSavedMsg('Saved');
                          setTimeout(() => setIdleSavedMsg(null), 2500);
                        } finally {
                          setSavingIdleSettings(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                        selected
                          ? 'border-accent bg-accent text-accent-contrast shadow-xs'
                          : 'border-subtle bg-surface text-sec hover:text-main hover:bg-surface-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Viewer Idle Timeout */}
            <div className="p-4 rounded-xl bg-subtle/60 border border-subtle space-y-2.5">
              <div>
                <span className="text-xs font-semibold text-main uppercase tracking-wider block">
                  Viewer Idle Timeout
                </span>
                <span className="text-[11px] text-mut">Default: 30 minutes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {IDLE_TIMEOUT_OPTIONS.map((opt) => {
                  const current = typeof viewerSettings.viewerIdleMinutes === 'number'
                    ? viewerSettings.viewerIdleMinutes
                    : 30;
                  const selected = current === opt.value;
                  return (
                    <button
                      key={`view-${opt.value}`}
                      type="button"
                      disabled={savingIdleSettings}
                      onClick={async () => {
                        if (selected) return;
                        setSavingIdleSettings(true);
                        setIdleSavedMsg(null);
                        try {
                          await updateViewerSettings({ viewerIdleMinutes: opt.value });
                          setIdleSavedMsg('Saved');
                          setTimeout(() => setIdleSavedMsg(null), 2500);
                        } finally {
                          setSavingIdleSettings(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                        selected
                          ? 'border-accent bg-accent text-accent-contrast shadow-xs'
                          : 'border-subtle bg-surface text-sec hover:text-main hover:bg-surface-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Viewer Access Section */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-main flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <span>Viewer Access</span>
            </h2>
            <p className="text-xs text-sec mt-1">
              Control how church members view read-only schedules, services, and the calendar from the login screen.
            </p>
          </div>
          {savingViewerSettings && (
            <span className="inline-flex items-center gap-1.5 text-xs text-sec font-medium">
              <Spinner size="xs" variant="accent" />
              <span>Saving...</span>
            </span>
          )}
        </div>

        {/* Mode Choice */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-main uppercase tracking-wider">
            Access Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={savingViewerSettings}
              onClick={() => handleSelectViewerMode('open')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                viewerSettings.mode === 'open'
                  ? 'border-accent ring-2 ring-accent/30 bg-accent-tint/30'
                  : 'border-subtle hover:border-strong bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-main">Open (anyone can view)</span>
                {viewerSettings.mode === 'open' && <Check className="w-4 h-4 text-accent shrink-0" />}
              </div>
              <p className="text-xs text-mut">
                Visitors can enter read-only viewer mode directly with one tap—no passcode needed.
              </p>
            </button>

            <button
              type="button"
              disabled={savingViewerSettings}
              onClick={() => handleSelectViewerMode('passcode')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${
                viewerSettings.mode === 'passcode'
                  ? 'border-accent ring-2 ring-accent/30 bg-accent-tint/30'
                  : 'border-subtle hover:border-strong bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-main">6-digit passcode</span>
                {viewerSettings.mode === 'passcode' && <Check className="w-4 h-4 text-accent shrink-0" />}
              </div>
              <p className="text-xs text-mut">
                Viewers must enter a 6-digit church passcode before viewing schedules or the calendar.
              </p>
            </button>
          </div>
        </div>

        {/* Warning if Passcode mode active without a valid 6-digit passcode */}
        {viewerSettings.mode === 'passcode' && !/^\d{6}$/.test(viewerSettings.passcode || '') && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Passcode not set yet:</strong> Viewer mode is set to 6-digit passcode, but no code has been created yet. Generate or enter a 6-digit passcode below so members can sign in.
            </span>
          </div>
        )}

        {/* Passcode Management */}
        {viewerSettings.mode === 'passcode' && (
          <div className="p-4 rounded-xl bg-subtle/60 border border-subtle space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-accent" />
                  <span>Current Viewer Passcode</span>
                </span>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="font-mono text-lg font-bold tracking-[0.25em] text-main bg-surface px-3 py-1 rounded-lg border border-subtle">
                    {/^\d{6}$/.test(viewerSettings.passcode || '')
                      ? (showPasscode ? viewerSettings.passcode : '••••••')
                      : 'Not set'}
                  </span>
                  {/^\d{6}$/.test(viewerSettings.passcode || '') && (
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="px-2.5 py-1.5 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-xs font-medium text-sec flex items-center gap-1.5 cursor-pointer"
                    >
                      {showPasscode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPasscode ? 'Hide' : 'Show'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={savingViewerSettings}
                  onClick={handleGeneratePasscode}
                  className="px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate</span>
                </button>
                <button
                  type="button"
                  disabled={savingViewerSettings}
                  onClick={() => {
                    setIsEditingPasscode(!isEditingPasscode);
                    setPasscodeDraft(viewerSettings.passcode || '');
                    setPasscodeError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-main text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isEditingPasscode ? 'Cancel' : 'Change'}
                </button>
              </div>
            </div>

            {isEditingPasscode && (
              <form onSubmit={handleSaveCustomPasscode} className="pt-3 border-t border-subtle space-y-2.5 max-w-sm">
                <label className="block text-xs font-semibold text-main">
                  Enter new 6-digit passcode
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={passcodeDraft}
                    onChange={(e) => {
                      setPasscodeDraft(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (passcodeError) setPasscodeError(null);
                    }}
                    placeholder="e.g. 123456"
                    className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main font-mono tracking-widest text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={savingViewerSettings || passcodeDraft.length !== 6}
                    className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                {passcodeError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passcodeError}</span>
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* Rebuild viewer-safe member copy */}
        <div className="pt-4 border-t border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-main">Viewer-Safe Member Copy</h3>
            <p className="text-xs text-mut mt-0.5 max-w-xl">
              Syncs member names, departments, and birthday month/day only (never contact numbers, addresses, notes, or Facebook links) for Viewer access.
            </p>
            {rebuildSuccessMsg && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{rebuildSuccessMsg}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={rebuildingViewerCopy}
            onClick={handleRebuildViewerCopy}
            className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-main text-xs font-semibold transition-colors inline-flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            {rebuildingViewerCopy ? (
              <>
                <Spinner size="xs" variant="accent" />
                <span>Rebuilding...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-accent" />
                <span>Rebuild viewer copy</span>
              </>
            )}
          </button>
        </div>

        {/* Future Viewer Accounts placeholder */}
        <div className="pt-4 border-t border-subtle flex items-center justify-between opacity-55 cursor-not-allowed select-none">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-mut" />
            <div>
              <div className="text-xs font-semibold text-main">Viewer accounts - coming later</div>
              <div className="text-[11px] text-mut">Individual named member viewer logins will be added in a future stage.</div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-subtle border border-subtle text-[10px] font-bold uppercase text-mut">
            Soon
          </span>
        </div>
      </div>

      {/* Data Management & Backup */}
      <DataBackupSection />
    </div>
  );
};
