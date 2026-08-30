import { useEffect, useState } from 'react';

import { today as todayIso } from './engine/dates';
import { backendBaseUrl, backendConfigured } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider, useTheme } from './lib/theme';
import { hrefFor, navigate, useRoute, type Route } from './lib/router';
import { FleetProvider, useFleet } from './lib/store';
import { FleetView } from './components/FleetView';
import { LoginView } from './components/LoginView';
import { MyVehicleView } from './components/MyVehicleView';
import { OwnersView } from './components/OwnersView';
import { RulesView } from './components/RulesView';
import { TodayView } from './components/TodayView';
import { VehicleView } from './components/VehicleView';
import { Banner, Card, EmptyState } from './components/ui';
import './styles/global.css';

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'today' }, label: 'Today' },
  { route: { name: 'fleet' }, label: 'Fleet' },
  { route: { name: 'owners' }, label: 'Owners' },
  { route: { name: 'rules' }, label: 'Rules' },
];

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AuthGate() {
  const { isAuthenticated, loading } = useAuth();
  const route = useRoute();

  // Vehicle owners never authenticate — this route is anonymous by design,
  // fetched from the public plate-lookup endpoint, not the fleet-wide store.
  if (route.name === 'my-vehicle') {
    return <MyVehicleView plate={route.plate} />;
  }

  if (loading) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
        <div className="skeleton" style={{ width: 280, height: 18 }} />
      </div>
    );
  }

  // Auth is the front door — show LoginView until authenticated, regardless of hash.
  // After login the user lands on #/ (Today) automatically.
  if (!isAuthenticated || route.name === 'login') {
    if (isAuthenticated && route.name === 'login') {
      // Already logged in but on #/login — bounce to today.
      navigate({ name: 'today' });
    } else if (!isAuthenticated) {
      return <LoginView />;
    }
  }

  return (
    <FleetProvider>
      <Shell />
    </FleetProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { fleet, loading, error, notice, source, localChanges, resetLocalChanges } = useFleet();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const asOf = todayIso();

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  return (
    <>
      <header className="header">
        <div className="header__inner">
          <button type="button" className="logo" onClick={() => navigate({ name: 'today' })}>
            <span className="logo__mark" aria-hidden="true">SD</span>
            <span className="logo__word">
              Service<span>Desk</span>
            </span>
          </button>

          <nav className="nav" data-open={menuOpen} aria-label="Main">
            {NAV.map((item) => (
              <a
                key={item.label}
                className="nav__link"
                href={hrefFor(item.route)}
                aria-current={route.name === item.route.name}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <span className="header__spacer" />

          <span className={`source-pill${source === 'backend' ? ' source-pill--live' : ''}`}>
            <span className="source-pill__dot" aria-hidden="true" />
            {source === 'backend' ? `Live · ${backendBaseUrl}` : 'Sample data'}
          </span>

          <div className="header__actions">
            <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggle} title={`Theme: ${theme} — click to toggle`}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>

            {user ? (
              <span className="user-pill" title={user.email}>
                <span className="user-pill__dot" style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--fine)', display: 'inline-block' }} aria-hidden="true" />
                <strong>{user.name}</strong>
                <button type="button" className="btn btn--sm" style={{ marginLeft: 6, padding: '3px 8px' }} onClick={logout}>
                  Log out
                </button>
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className="burger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
      </header>

      <main className="page">
        {notice ? (
          <Banner tone="warn" mark="!" title="Backend notice">
            {notice}
          </Banner>
        ) : null}

        {localChanges > 0 && !backendConfigured ? (
          <Banner
            tone="info"
            mark="i"
            title={`${localChanges} service${localChanges === 1 ? '' : 's'} recorded in this browser`}
            actions={
              <button type="button" className="btn btn--sm" onClick={resetLocalChanges}>
                Reset demo
              </button>
            }
          >
            No backend is configured, so completed services are kept in this browser only.
            Set <code>VITE_API_BASE_URL</code> in <code>.env</code> to persist them.
          </Banner>
        ) : null}

        {error ? (
          <Card>
            <EmptyState title="Could not load the fleet">{error}</EmptyState>
          </Card>
        ) : loading || !fleet ? (
          <LoadingSkeleton />
        ) : route.name === 'fleet' ? (
          <FleetView fleet={fleet} asOf={asOf} />
        ) : route.name === 'owners' ? (
          <OwnersView fleet={fleet} asOf={asOf} />
        ) : route.name === 'rules' ? (
          <RulesView />
        ) : route.name === 'vehicle' ? (
          <VehicleView fleet={fleet} vehicleId={route.id} asOf={asOf} />
        ) : (
          <TodayView fleet={fleet} asOf={asOf} />
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <span>
            {fleet ? `${fleet.meta.workshop} · ${fleet.meta.city}` : 'ServiceDesk'} · figures as of{' '}
            {asOf}
          </span>
          <span>Team t043 · Problem p09 · LSH26-8490-C900</span>
        </div>
      </footer>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 420 }} />
      <div className="grid grid--stats">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </>
  );
}
