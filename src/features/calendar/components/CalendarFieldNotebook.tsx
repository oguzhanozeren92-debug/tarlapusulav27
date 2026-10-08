import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Coins,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import type { Field } from '../../../types';
import {
  FIELD_OPERATION_OPTIONS,
  type FieldOperationType,
} from '../../field-operations/types/fieldOperation';
import { createFieldOperation } from '../../field-operations/services/fieldOperation.service';
import './CalendarFieldNotebook.css';

type NotebookActivity = {
  id: string;
  type: string;
  title: string;
  date: string;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
  notes: string | null;
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

function trDate(value: string) {
  const parsed = Date.parse(`${value}T12:00:00`);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(parsed));
}

export default function CalendarFieldNotebook({ fields }: { fields: Field[] }) {
  const usableFields = useMemo(() => fields.filter((field) => !field.demo), [fields]);
  const [fieldId, setFieldId] = useState(() => String(usableFields[0]?.id ?? ''));
  const [items, setItems] = useState<NotebookActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<FieldOperationType>('Saha Kontrolü');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (fieldId && usableFields.some((field) => String(field.id) === fieldId)) return;
    setFieldId(String(usableFields[0]?.id ?? ''));
  }, [fieldId, usableFields]);

  const selectedField = usableFields.find((field) => String(field.id) === fieldId) ?? null;

  const load = useCallback(async () => {
    if (!fieldId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('activities')
        .select('id,activity_type,title,activity_date,product_name,quantity,unit,cost,notes')
        .eq('user_id', auth.user.id)
        .eq('field_id', fieldId)
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setItems((data ?? []).map((item: any) => ({
        id: String(item.id),
        type: String(item.activity_type ?? 'Diğer'),
        title: String(item.title ?? item.activity_type ?? 'Tarla işlemi'),
        date: String(item.activity_date ?? ''),
        productName: item.product_name ? String(item.product_name) : null,
        quantity: finite(item.quantity),
        unit: item.unit ? String(item.unit) : null,
        cost: finite(item.cost),
        notes: item.notes ? String(item.notes) : null,
      })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tarla Defteri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [fieldId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const changedField = String(detail?.fieldId ?? '').trim();
      if (!changedField || changedField === fieldId) void load();
    };
    window.addEventListener('tp:field-operation-changed', refresh as EventListener);
    return () => window.removeEventListener('tp:field-operation-changed', refresh as EventListener);
  }, [fieldId, load]);

  useEffect(() => {
    if (!fieldId) return undefined;

    const channel = supabase
      .channel(`tp-calendar-notebook-${fieldId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `field_id=eq.${fieldId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fieldId, load]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void load();
    };

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [load]);

  const totalCost = items.reduce((sum, item) => sum + (item.cost ?? 0), 0);
  const lastActivity = items[0] ?? null;

  const resetForm = () => {
    setType('Saha Kontrolü');
    setDate(new Date().toISOString().slice(0, 10));
    setProductName('');
    setQuantity('');
    setUnit('');
    setCost('');
    setNotes('');
    setMessage('');
  };

  const save = async () => {
    if (!selectedField) {
      setMessage('Önce tarla seç.');
      return;
    }
    if (!date) {
      setMessage('İşlem tarihini seç.');
      return;
    }

    const quantityValue = quantity.trim() ? Number(quantity.replace(',', '.')) : null;
    const costValue = cost.trim() ? Number(cost.replace(',', '.')) : null;
    if (quantityValue !== null && (!Number.isFinite(quantityValue) || quantityValue < 0)) {
      setMessage('Miktar geçerli değil.');
      return;
    }
    if (costValue !== null && (!Number.isFinite(costValue) || costValue < 0)) {
      setMessage('Maliyet geçerli değil.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await createFieldOperation({
        fieldId: String(selectedField.id),
        type,
        date,
        productName: productName.trim() || null,
        quantity: quantityValue,
        unit: unit.trim() || null,
        cost: costValue,
        notes: notes.trim() || null,
      });

      setFormOpen(false);
      resetForm();
      setMessage('Faaliyet Tarla Defteri’ne kaydedildi.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Faaliyet kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tp-calendar-notebook">
      <header className="tp-calendar-notebook-head">
        <div>
          <span>TARLA DEFTERİ</span>
          <strong>Tarlada ne yaptıysan burada birikir</strong>
          <p>Uygulamanın diğer bölümlerinde kaydettiğin saha işlemleri de otomatik olarak bu deftere eklenir.</p>
        </div>
        <button type="button" className="tp-calendar-notebook-refresh" onClick={() => void load()} disabled={loading} aria-label="Tarla Defterini yenile">
          <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
        </button>
      </header>

      {usableFields.length ? (
        <div className="tp-calendar-notebook-field-row">
          <label>
            <small>Tarla</small>
            <select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
              {usableFields.map((field) => (
                <option key={String(field.id)} value={String(field.id)}>{field.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="tp-calendar-notebook-add" onClick={() => { resetForm(); setFormOpen(true); }}>
            <CirclePlus size={16} /> Faaliyet ekle
          </button>
        </div>
      ) : (
        <div className="tp-calendar-notebook-empty">Tarla Defteri için önce gerçek bir tarla ekle.</div>
      )}

      <div className="tp-calendar-notebook-stats">
        <article><BookOpenText size={17} /><span><small>Kayıt</small><strong>{items.length}</strong></span></article>
        <article><Coins size={17} /><span><small>Kayıtlı gider</small><strong>{money(totalCost)}</strong></span></article>
        <article><CalendarDays size={17} /><span><small>Son işlem</small><strong>{lastActivity ? trDate(lastActivity.date) : '—'}</strong></span></article>
      </div>

      {message ? <p className="tp-calendar-notebook-message">{message}</p> : null}

      <div className="tp-calendar-notebook-list">
        {loading ? (
          <div className="tp-calendar-notebook-empty">Tarla Defteri yükleniyor…</div>
        ) : items.length ? (
          items.slice(0, 12).map((item) => (
            <article key={item.id}>
              <div className="tp-calendar-notebook-date">{trDate(item.date)}</div>
              <div className="tp-calendar-notebook-copy">
                <small>{item.type}</small>
                <strong>{item.title}</strong>
                <p>
                  {[item.productName, item.quantity !== null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : null, item.cost !== null ? money(item.cost) : null]
                    .filter(Boolean)
                    .join(' · ') || item.notes || 'Kısa saha kaydı'}
                </p>
              </div>
              <ChevronRight size={16} />
            </article>
          ))
        ) : usableFields.length ? (
          <div className="tp-calendar-notebook-empty">Bu tarlada henüz faaliyet kaydı yok.</div>
        ) : null}
      </div>

      {formOpen ? (
        <div className="tp-calendar-notebook-modal" onMouseDown={() => !saving && setFormOpen(false)}>
          <div className="tp-calendar-notebook-form" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>HIZLI KAYIT</span><strong>Tarla Defterine faaliyet ekle</strong></div>
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving}><X size={18} /></button>
            </header>

            <label><span>İşlem</span><select value={type} onChange={(event) => setType(event.target.value as FieldOperationType)}>{FIELD_OPERATION_OPTIONS.map((item) => <option key={item.type} value={item.type}>{item.shortLabel}</option>)}</select></label>
            <label><span>Tarih</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label><span>Ürün / materyal</span><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Opsiyonel" /></label>
            <div className="tp-calendar-notebook-form-pair">
              <label><span>Miktar</span><input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Örn. 25" /></label>
              <label><span>Birim</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="kg, L, m³" /></label>
            </div>
            <label><span>Maliyet (TL)</span><input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Opsiyonel" /></label>
            <label><span>Not</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Kısa saha notu…" /></label>
            {message ? <p className="tp-calendar-notebook-message">{message}</p> : null}
            <button type="button" className="tp-calendar-notebook-save" onClick={() => void save()} disabled={saving}>
              <Save size={16} /> {saving ? 'Kaydediliyor…' : 'Deftere kaydet'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
