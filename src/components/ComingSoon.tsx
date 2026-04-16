import React from 'react';
import { ASSETS } from '../util/constants';
import './ComingSoon.css';

interface ComingSoonProps {
  availableHeight: number;
}

const ComingSoon: React.FC<ComingSoonProps> = ({ availableHeight }) => {
  return (
    <div className="coming-soon" style={{ minHeight: availableHeight }}>
      <img
        src={ASSETS.logoMark}
        alt="Koinonia Coffee Project"
        className="coming-soon-logo"
      />
      <h1 className="coming-soon-title">Coming Soon!</h1>
    </div>
  );
};

export default ComingSoon;
