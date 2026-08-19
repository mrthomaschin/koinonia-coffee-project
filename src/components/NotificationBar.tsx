import React from 'react';
import './NotificationBar.css';

interface NotificationBarProps {
  enabled?: boolean;
  message?: string;
}

const NotificationBar: React.FC<NotificationBarProps> = ({
  enabled = true,
  message = "Free shipping on orders over $35"
}) => {
  if (!enabled) return null;

  return (
    <div className="notification-bar">
      <div className="notification-bar-content">
        <span className="notification-message">{message}</span>
      </div>
    </div>
  );
};

export default NotificationBar;
