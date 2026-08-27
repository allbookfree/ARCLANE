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

export function getStudioViewFromPath(pathname: string): StudioView {
  const clean = pathname.replace(/\/$/, '');
  if (clean === '/studio' || clean === '') return 'overview';
  if (clean === '/studio/ideas') return 'ideas';
  if (clean === '/studio/research') return 'research';
  if (clean === '/studio/scripts') return 'scripts';
  if (clean === '/studio/voiceover') return 'voiceover';
  if (clean === '/studio/visuals') return 'visuals';
  if (clean === '/studio/audio') return 'audio';
  if (clean === '/studio/thumbnails') return 'thumbnails';
  if (clean === '/studio/description') return 'description';
  if (clean === '/studio/shorts') return 'shorts';
  if (clean === '/studio/memory') return 'memory';
  if (clean.startsWith('/studio/settings')) return 'settings';
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
      event.altKey ||
      event.defaultPrevented)
  ) {
    return;
  }

  const [pathAndQuery, hash] = href.split('#');
  const targetPath = pathAndQuery || '/studio';
  const currentPath = window.location.pathname + window.location.search;

  if (currentPath === targetPath && hash) {
    if (event) event.preventDefault();
    window.location.hash = hash;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  if (event) event.preventDefault();
  window.location.assign(href);
}
