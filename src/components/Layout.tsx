import { NavLink, Outlet, Link } from 'react-router';
import { Activity, CalendarRange, Footprints, History, Mountain, SlidersHorizontal } from 'lucide-react';
import { useReady } from '../lib/data';

const NAV = [
  { to: '/', label: 'Aujourd’hui', icon: Footprints, end: true },
  { to: '/plan', label: 'Plan', icon: CalendarRange },
  { to: '/sur-mesure', label: 'Séance sur mesure', short: 'Sur mesure', icon: SlidersHorizontal },
  { to: '/forme', label: 'Forme', icon: Activity },
  { to: '/sorties', label: 'Sorties', icon: History },
  { to: '/parcours', label: 'Parcours', icon: Mountain },
];

export function Layout() {
  const { me } = useReady();
  const initials = `${me.firstname[0] ?? ''}${me.lastname[0] ?? ''}`.toUpperCase();
  return (
    <div className="app">
      <header className="appbar">
        <Link to="/" className="brand">
          FOULÉE
        </Link>
        <nav className="appnav" aria-label="Navigation principale">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
        <Link to="/profil" className="me" aria-label="Profil">
          <span className="who">{me.firstname}</span>
          <span>{me.avatar ? <img src={me.avatar} alt="" /> : initials}</span>
        </Link>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Navigation">
        {NAV.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={20} aria-hidden />
            {short ?? label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
