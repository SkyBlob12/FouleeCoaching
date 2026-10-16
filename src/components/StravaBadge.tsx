import black from '../assets/strava/compatible-with-strava-black.svg';
import white from '../assets/strava/compatible-with-strava-white.svg';
import connect from '../assets/strava/connect-with-strava.svg';

/** Logo officiel « Compatible with Strava » (fichiers non modifiés, règles de marque Strava). */
export function CompatibleWithStrava() {
  return (
    <picture className="strava-badge">
      <source srcSet={white} media="(prefers-color-scheme: dark)" />
      <img src={black} alt="Compatible with Strava" width={162} height={14} />
    </picture>
  );
}

/** Bouton officiel « Connect with Strava », 48 px de haut. */
export function ConnectWithStrava() {
  return (
    <a href="/api/auth/strava" className="strava-connect">
      <img src={connect} alt="Connect with Strava" width={237} height={48} />
    </a>
  );
}
