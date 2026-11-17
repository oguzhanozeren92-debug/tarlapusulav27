import { ShieldAlert } from 'lucide-react';
import { activeHarvestHolds, daysUntil } from '../services/preHarvestInterval';
import './FieldHarvestSafetyCard.css';

type ActivityLike = { type: string; activityDate: string; productName: string | null; notes: string | null };
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Yalnızca süren bir bekleme süresi varsa görünür. */
export default function FieldHarvestSafetyCard({ activities }: { activities: ActivityLike[] }) {
  const today = localToday();
  const holds = activeHarvestHolds(activities, today);
  if (!holds.length) return null;
  const latest = holds[0];
  const left = daysUntil(today, latest.safeFrom);
  return (
    <section className="tp-harvest-safety" aria-label="Hasat güvenliği">
      <div className="tp-harvest-safety-head">
        <span aria-hidden="true"><ShieldAlert size={20} /></span>
        <div>
          <small>HASAT GÜVENLİĞİ</small>
          <strong>En erken hasat: {dayLabel(latest.safeFrom)}</strong>
          <p>{left} gün kaldı. Bu tarihten önce hasat edilen üründe ilaç kalıntısı yasal sınırı aşabilir.</p>
        </div>
      </div>
      <ul>
        {holds.map((h) => (
          <li key={`${h.activityDate}-${h.productName ?? ''}-${h.days}`}>
            <b>{h.productName || 'İlaçlama'}</b>
            <span>{dayLabel(h.activityDate)} · bekleme {h.days} gün → {dayLabel(h.safeFrom)}</span>
          </li>
        ))}
      </ul>
      <p className="tp-harvest-safety-note">Süreler, ilaçlama kaydına girdiğin etiket bilgisinden hesaplanır.</p>
    </section>
  );
}
