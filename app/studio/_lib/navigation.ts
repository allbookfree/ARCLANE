export type StudioView =
  | 'overview'
  | 'ideas'
  | 'research'
  | 'scripts'
  | 'voiceover'
  | 'visuals'
  | 'audio'
  | 'thumbnails'
  | 'description'
  | 'shorts'
  | 'memory'
  | 'settings';

export const STUDIO_NAVIGATE_EVENT = 'arclane:studio-navigate';

const studioViewBySegment: Record<string, StudioView> = {
  ideas: 'ideas',
  research: 'research',
  scripts: 'scripts',
  voiceover: 'voiceover',
  visuals: 'visuals',
  audio: 'audio',
  thumbnails: 'thumbnails',
  description: 'description',
  shorts: 'shorts',
  memory: 'memory',
  settings: 'settings',
};

export function getStudioViewFromPath(pathname: string): StudioView {
  const clean = pathname.replace(/\/$/, '').toLowerCase();
  if (clean === '/studio' || clean === '') return 'overview';
  const segment = clean.replace(/^\/studio\/?/, '').split('/')[0];
  if (segment && segment in studioViewBySegment) return studioViewBySegment[segment];
  return 'overview';
}

export function studioNavigate(href: string, event?: React.MouseEvent | MouseEvent) {
  if (typeof window === 'undefined') return;

  if (
    event &&
    (event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey)
  ) {
    return;
  }

  const [pathAndQuery, hash] = href.split('#');
  const targetPath = pathAndQuery || '/studio';
  const currentPath = window.location.pathname + window.location.search;
  const currentHash = window.location.hash;
  const targetHash = hash ? `#${hash}` : '';

  if (window.location.pathname.startsWith('/studio') && targetPath.startsWith('/studio')) {
    if (event) {
      event.preventDefault();
    }

    if (currentPath !== targetPath || currentHash !== targetHash) {
      window.history.pushState(null, '', href);
    }

    const view = getStudioViewFromPath(targetPath);
    window.dispatchEvent(
      new CustomEvent(STUDIO_NAVIGATE_EVENT, {
        detail: { href, view },
      }),
    );

    if (hash) {
      requestAnimationFrame(() => {
        const target = document.getElementById(hash);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    } else {
      window.scrollTo({ top: 0, left: 0 });
    }
  } else {
    if (!event) {
      window.location.assign(href);
    }
  }
}
