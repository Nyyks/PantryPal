import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

/**
 * ComboSelect — a dropdown that shows existing options, but also allows typing a custom value.
 * Props:
 *   value       - current value (string)
 *   onChange     - called with new string value
 *   options      - array of strings (existing choices)
 *   placeholder  - placeholder text
 *   allowCustom  - if true, shows "Add new" option when typing something not in the list (default true)
 */
export default function ComboSelect({ value, onChange, options = [], placeholder = 'Select...', allowCustom = true }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setIsTyping(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes((isTyping ? filter : '').toLowerCase())
  );

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setIsTyping(false);
    setFilter('');
  };

  const handleInputChange = (e) => {
    setFilter(e.target.value);
    setIsTyping(true);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isTyping && filter.trim()) {
        handleSelect(filter.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setIsTyping(false);
    }
  };

  const showCustomOption = allowCustom && isTyping && filter.trim() &&
    !options.some(o => o.toLowerCase() === filter.trim().toLowerCase());

  const displayValue = isTyping ? filter : (value || '');

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          style={{ paddingRight: 32 }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setOpen(!open); if (!open) inputRef.current?.focus(); }}
          style={{
            position: 'absolute', right: 1, top: 1, bottom: 1,
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: '0 8px',
            color: 'var(--text-muted)',
          }}
        >
          <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {open && (filtered.length > 0 || showCustomOption) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', marginTop: 2,
          maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {/* Clear / none option */}
          {value && (
            <button
              type="button"
              onClick={() => handleSelect('')}
              style={{
                width: '100%', padding: '8px 12px', border: 'none',
                background: 'transparent', color: 'var(--text-muted)',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
                borderBottom: '1px solid var(--border)', fontStyle: 'italic',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Clear
            </button>
          )}
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => handleSelect(o)}
              style={{
                width: '100%', padding: '8px 12px', border: 'none',
                background: o === value ? 'var(--accent-muted)' : 'transparent',
                color: o === value ? 'var(--accent)' : 'var(--text-primary)',
                cursor: 'pointer', textAlign: 'left', fontSize: 13,
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseOver={e => { if (o !== value) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
              onMouseOut={e => { if (o !== value) e.currentTarget.style.background = 'transparent'; }}
            >
              {o}
            </button>
          ))}
          {showCustomOption && (
            <button
              type="button"
              onClick={() => handleSelect(filter.trim())}
              style={{
                width: '100%', padding: '8px 12px', border: 'none',
                background: 'transparent', color: 'var(--green)',
                cursor: 'pointer', textAlign: 'left', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-sans)',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <Plus size={12} /> Add "{filter.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
