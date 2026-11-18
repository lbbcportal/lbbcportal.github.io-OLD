import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

export const DocumentTitleSync: React.FC = () => {
  const { currentUser, isViewer, viewerUnlocked, publicBranding } = useAuth();
  const { settings } = useData();

  const isAuthenticatedSession = Boolean(currentUser && (!isViewer || viewerUnlocked));
  const churchName = (
    (isAuthenticatedSession ? settings.churchName : publicBranding.churchName) ||
    publicBranding.churchName ||
    ''
  ).trim();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = churchName ? `${churchName} - Secretary Companion` : 'Secretary Companion';
  }, [churchName]);

  return null;
};
