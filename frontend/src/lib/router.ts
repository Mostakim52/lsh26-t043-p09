import { useEffect, useState } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'fleet' }
  | { name: 'owners' }
  | { name: 'rules' }
  | { name: 'vehicle'; id: string }
  | { name: 'login' };

/**
 * A hash router in a dozen lines. Vehicle pages are worth a real URL — the workshop
 * pastes them to each other — but the app is small enough that a routing library
 * would be more configuration than code.
 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [head, param] = path.split('/');

  switch (head) {
    case 'login':
      return { name: 'login' };
    case 'fleet':
      return { name: 'fleet' };
    case 'owners':
      return { name: 'owners' };
    case 'rules':
      return { name: 'rules' };
    case 'vehicle':
      return param ? { name: 'vehicle', id: decodeURIComponent(param) } : { name: 'fleet' };
    default:
      return { name: 'today' };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'vehicle':
      return `#/vehicle/${encodeURIComponent(route.id)}`;
    case 'today':
      return '#/';
    case 'login':
      return '#/login';
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  const next = hrefFor(route);
  if (window.location.hash !== next) window.location.hash = next;
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
