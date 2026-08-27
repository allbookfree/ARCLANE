'use client';

import { useEffect, useState } from 'react';
import { STUDIO_NAVIGATE_EVENT, getStudioViewFromPath, type StudioView } from '../_lib/navigation';
import StudioOverview from './studio-overview';
import IdeasWorkspace from './ideas-workspace';
import ResearchWorkspace from './research-workspace';
import ScriptWorkspace from './script-workspace';
import VoiceoverWorkspace from './voiceover-workspace';
import VisualsWorkspace from './visuals-workspace';
import AudioWorkspace from './audio-workspace';
import ThumbnailWorkspace from './thumbnail-workspace';
import DescriptionWorkspace from './description-workspace';
import ShortsWorkspace from './shorts-workspace';
import MemoryWorkspace from './memory-workspace';
import SettingsWorkspace from './settings-workspace';

type StudioRouterProps = {
  initialView?: StudioView;
};

export default function StudioRouter({ initialView = 'overview' }: StudioRouterProps) {
  const [view, setView] = useState<StudioView>(initialView);

  useEffect(() => {
    const currentPathView = getStudioViewFromPath(window.location.pathname);
    if (currentPathView !== view) {
      setView(currentPathView);
    }

    const handlePopState = () => {
      setView(getStudioViewFromPath(window.location.pathname));
    };

    const handleStudioNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ view: StudioView; href: string }>;
      if (customEvent.detail?.view) {
        setView(customEvent.detail.view);
      } else {
        setView(getStudioViewFromPath(window.location.pathname));
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener(STUDIO_NAVIGATE_EVENT, handleStudioNavigate);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener(STUDIO_NAVIGATE_EVENT, handleStudioNavigate);
    };
  }, []);

  switch (view) {
    case 'overview':
      return <StudioOverview />;
    case 'ideas':
      return <IdeasWorkspace />;
    case 'research':
      return <ResearchWorkspace />;
    case 'scripts':
      return <ScriptWorkspace />;
    case 'voiceover':
      return <VoiceoverWorkspace />;
    case 'visuals':
      return <VisualsWorkspace />;
    case 'audio':
      return <AudioWorkspace />;
    case 'thumbnails':
      return <ThumbnailWorkspace />;
    case 'description':
      return <DescriptionWorkspace />;
    case 'shorts':
      return <ShortsWorkspace />;
    case 'memory':
      return <MemoryWorkspace />;
    case 'settings':
      return <SettingsWorkspace />;
    default:
      return <StudioOverview />;
  }
}
