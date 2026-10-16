import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { DataProvider, useData } from './lib/data';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Today } from './pages/Today';
import { PlanPage } from './pages/PlanPage';
import { PlanNew } from './pages/PlanNew';
import { SessionPage } from './pages/SessionPage';
import { Custom } from './pages/Custom';
import { Fitness } from './pages/Fitness';
import { Course } from './pages/Course';
import { Profile } from './pages/Profile';
import { Activities } from './pages/Activities';

function Gate() {
  const { status, error, reload } = useData();
  if (status === 'loading') return <Loading />;
  if (status === 'error')
    return (
      <div className="login">
        <div className="login-inner stack">
          <h1>Impossible de charger Foulée</h1>
          <p className="notice error">{error}</p>
          <button className="btn btn-primary" onClick={() => reload()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  if (status === 'anonymous')
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  return (
    <Routes>
      <Route path="/connexion" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="plan/nouveau" element={<PlanNew />} />
        <Route path="plan/modifier" element={<PlanNew key="edit" edit />} />
        <Route path="seance/:key" element={<SessionPage />} />
        <Route path="sur-mesure" element={<Custom />} />
        <Route path="forme" element={<Fitness />} />
        <Route path="sorties" element={<Activities />} />
        <Route path="parcours" element={<Course />} />
        <Route path="profil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-label="Chargement">
      FOULÉE
      <div className="skeleton" style={{ width: 'min(480px, 90vw)', height: 12 }} />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Gate />
      </DataProvider>
    </BrowserRouter>
  );
}
