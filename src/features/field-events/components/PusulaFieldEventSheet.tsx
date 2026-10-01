import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ClipboardPlus,
  Droplets,
  FlaskConical,
  LandPlot,
  MoreHorizontal,
  PencilLine,
  Sprout,
  Tractor,
  Wheat,
  X,
} from 'lucide-react';
import type { FieldOperationType } from '../../field-operations/types/fieldOperation';
import type { HybrisFieldEvent } from '../../../services/hybrisFieldEvents.service';
import './PusulaFieldEventSheet.css';

type AnswerOption = {
  type: FieldOperationType;
  label: string;
  icon: typeof Tractor;
};

const ANSWERS: AnswerOption[] = [
  { type: 'Sürme', label: 'Sürme', icon: Tractor },
  { type: 'İkileme', label: 'İkileme', icon: Tractor },
  { type: 'Ekim / Dikim', label: 'Ekim / Dikim', icon: Sprout },
  { type: 'Gübreleme', label: 'Gübreleme', icon: FlaskConical },
  { type: 'İlaçlama', label: 'İlaçlama', icon: FlaskConical },
  { type: 'Sulama', label: 'Sulama', icon: Droplets },
  { type: 'Çapalama', label: 'Çapalama', icon: LandPlot },
  { type: 'Budama', label: 'Budama', icon: PencilLine },
  { type: 'Hasat', label: 'Hasat', icon: Wheat },
  { type: 'Saha Kontrolü', label: 'Saha kontrolü', icon: ClipboardPlus },
  { type: 'Diğer', label: 'Diğer', icon: MoreHorizontal },
];

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function trDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
  }).format(parsed);
}

function eventLabel(event: HybrisFieldEvent) {
  if (event.type === 'sowing') return 'ekim benzeri bir değişim';
  if (event.type === 'harvest') return 'hasat benzeri bir değişim';
  return 'tarla yüzeyinde bir hareketlilik';
}

export default function PusulaFieldEventSheet({
  open,
  fieldName,
  candidate,
  onClose,
  onDismiss,
  onConfirm,
}: {
  open: boolean;
  fieldName: string;
  candidate: HybrisFieldEvent | null;
  onClose: () => void;
  onDismiss: () => Promise<void>;
  onConfirm: (input: {
    operationType: FieldOperationType;
    date: string;
    note?: string | null;
  }) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<AnswerOption | null>(null);
  const [date, setDate] = useState('');
  const [otherNote, setOtherNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !candidate) return;
    setSelected(null);
    setDate(candidate.signalDate);
    setOtherNote('');
    setSaving(false);
    setError(null);
  }, [open, candidate?.signalDate]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const dateLabel = useMemo(() => (date ? trDate(date) : ''), [date]);
  const SelectedIcon = selected?.icon ?? MoreHorizontal;

  if (!open || !candidate) return null;

  const save = async () => {
    if (!selected || !date || saving) return;
    setSaving(true);
    setError(null);

    try {
      await onConfirm({
        operationType: selected.type,
        date,
        note: selected.type === 'Diğer' ? otherNote.trim() || null : null,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'İşlem kaydedilemedi.');
      setSaving(false);
    }
  };

  const dismiss = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      await onDismiss();
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : 'Cevap kaydedilemedi.');
      setSaving(false);
    }
  };

  return (
    <div
      className="tp-field-event-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className={`tp-field-event-sheet${selected ? ' is-confirming' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-field-event-title"
      >
        <div className="tp-field-event-handle" aria-hidden="true" />

        <header className="tp-field-event-head">
          {selected ? (
            <button
              type="button"
              className="tp-field-event-back"
              onClick={() => {
                if (saving) return;
                setSelected(null);
                setError(null);
              }}
              disabled={saving}
              aria-label="İşlem seçimine dön"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
          ) : (
            <div className="tp-field-event-head-spacer" aria-hidden="true" />
          )}

          <div className="tp-field-event-title-copy">
            <small>PUSULA · {trDate(candidate.signalDate)} CİVARI</small>
            <h3 id="tp-field-event-title">Tarla işlemini ekle</h3>
            <p>
              {fieldName} için {eventLabel(candidate)} fark ettim. Yaptığın işlemi seç.
            </p>
          </div>

          <button
            type="button"
            className="tp-field-event-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Kapat"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        {!selected ? (
          <>
            <div className="tp-field-event-operation-grid" aria-label="Tarla işlemi türleri">
              {ANSWERS.map((answer) => {
                const Icon = answer.icon;
                return (
                  <button
                    key={answer.type}
                    type="button"
                    className="tp-field-event-operation"
                    onClick={() => {
                      setSelected(answer);
                      setError(null);
                    }}
                    disabled={saving}
                  >
                    <span className="tp-field-event-operation-icon" aria-hidden="true">
                      <Icon size={22} strokeWidth={1.8} />
                    </span>
                    <span>{answer.label}</span>
                  </button>
                );
              })}
            </div>

            {error ? <div className="tp-field-event-error">{error}</div> : null}

            <button
              type="button"
              className="tp-field-event-none"
              onClick={() => void dismiss()}
              disabled={saving}
            >
              {saving ? 'Kaydediliyor…' : 'Bu dönemde tarla işlemi yapmadım'}
            </button>
          </>
        ) : (
          <div className="tp-field-event-confirm">
            <div className="tp-field-event-selected">
              <span className="tp-field-event-selected-icon" aria-hidden="true">
                <SelectedIcon size={24} strokeWidth={1.8} />
              </span>
              <div>
                <small>SEÇİLEN İŞLEM</small>
                <strong>{selected.label}</strong>
              </div>
            </div>

            <label className="tp-field-event-date">
              <span>İşlem tarihi</span>
              <input
                type="date"
                value={date}
                max={localToday()}
                onChange={(event) => setDate(event.target.value)}
                disabled={saving}
              />
              <small>Uydu/radar tarihi yaklaşık. Gerekirse tarihi düzelt.</small>
            </label>

            {selected.type === 'Diğer' ? (
              <label className="tp-field-event-date">
                <span>Ne yaptın?</span>
                <input
                  type="text"
                  value={otherNote}
                  maxLength={180}
                  placeholder="Kısaca yazabilirsin"
                  onChange={(event) => setOtherNote(event.target.value)}
                  disabled={saving}
                />
              </label>
            ) : null}

            {error ? <div className="tp-field-event-error">{error}</div> : null}

            <div className="tp-field-event-confirm-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (saving) return;
                  setSelected(null);
                  setError(null);
                }}
                disabled={saving}
              >
                Başka işlem seç
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void save()}
                disabled={saving || !date || (selected.type === 'Diğer' && !otherNote.trim())}
              >
                {saving ? 'Ekleniyor…' : `${selected.label} olarak ekle`}
              </button>
            </div>

            <p className="tp-field-event-confirm-note">
              {dateLabel} tarihli kayıt yalnız sen onayladığında Tarla Günlüğü'ne eklenir.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
