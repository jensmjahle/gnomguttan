import type { SharedLocation } from '@/services/matrixLocation';
import { MatrixIcon } from './MatrixUi';
import styles from '@/pages/Chat2Page.module.css';

export function MatrixLocation({ location, label = 'Delt posisjon' }: { location: SharedLocation; label?: string }) {
  const { latitude, longitude, accuracy } = location;
  const coordinates = `${latitude},${longitude}`;
  return <div className={styles.locationCard}>
    <div className={styles.locationHeading}><span><MatrixIcon name="location" size={23}/></span><div><strong>{label}</strong><small>{latitude.toFixed(6)}, {longitude.toFixed(6)}</small></div></div>
    {accuracy !== undefined && <small>Nøyaktighet: cirka {Math.round(accuracy)} meter</small>}
    <div className={styles.locationLinks}><a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`} target="_blank" rel="noreferrer">Åpne kart ↗</a><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`} target="_blank" rel="noreferrer">Veibeskrivelse ↗</a></div>
  </div>;
}
