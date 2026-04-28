import { Check, AlertCircle, Info } from 'lucide-react';

const icons = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

export default function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => {
        const Icon = icons[t.type] || Info;
        return (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon size={16} style={{ color: t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--red)' : 'var(--accent)', flexShrink: 0 }} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
