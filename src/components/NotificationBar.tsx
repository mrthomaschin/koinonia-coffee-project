import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './NotificationBar.css';
import { Announcement } from '../config/announcements';

interface NotificationBarProps {
  enabled?: boolean;
  announcements: Announcement[];
  /** Milliseconds each announcement stays visible. */
  intervalMs?: number;
}

const ROTATE_ANIMATION_MS = 400;

const NotificationBar: React.FC<NotificationBarProps> = ({ enabled = true, announcements, intervalMs = 6000 }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = announcements.length;
  const current = announcements[count > 0 ? index % count : 0];

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setTimeout(() => setIndex(i => (i + 1) % count), intervalMs);
    return () => window.clearTimeout(timer);
  }, [count, paused, index, intervalMs]);

  if (!enabled || !current) return null;

  const content = current.href && /^https?:/.test(current.href)
    ? <a className="notification-link" href={current.href} target="_blank" rel="noopener noreferrer">{current.message}</a>
    : current.href
      ? <Link className="notification-link" to={current.href}>{current.message}</Link>
      : current.message;

  return (
    <div
      className="notification-bar"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-label="Announcements"
    >
      <div className="notification-bar-content" aria-live={paused ? 'polite' : 'off'}>
        <span key={current.id} className="notification-message" style={{ animationDuration: `${ROTATE_ANIMATION_MS}ms` }}>{content}</span>
      </div>
    </div>
  );
};

export default NotificationBar;
