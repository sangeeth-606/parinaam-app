/**
 * Parinaam icon set — hand-drawn stroke icons on a 24×24 grid, 1.8 stroke, rounded caps.
 * Single implementation in react-native-svg (works on Android + Web, crisp at any size).
 * Icons are chrome: they never convey statutory meaning on their own.
 */

import React from 'react';
import Svg, { Path, Circle, Rect, Line, G } from 'react-native-svg';
import { useAppTheme } from '../../theme/theme-context';

export type IconName =
  | 'duty'
  | 'ledger'
  | 'camera'
  | 'plus'
  | 'shield'
  | 'chain'
  | 'clock'
  | 'package'
  | 'flask'
  | 'search'
  | 'settings'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronUp'
  | 'check'
  | 'close'
  | 'alert'
  | 'lock'
  | 'wifi'
  | 'wifiOff'
  | 'refresh'
  | 'download'
  | 'pin'
  | 'waveform'
  | 'globe'
  | 'info'
  | 'document'
  | 'link'
  | 'key'
  | 'minus'
  | 'sun'
  | 'moon'
  | 'home'
  | 'cases'
  | 'scan'
  | 'user'
  | 'fingerprint'
  | 'scale'
  | 'microscope'
  | 'checkBadge'
  | 'palette'
  | 'crosshairs'
  | 'cpu'
  | 'edit'
  | 'shieldCheck';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const shapes: Record<IconName, React.ReactNode> = {
  duty: (
    <G>
      <Rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <Line x1="3.5" y1="9" x2="20.5" y2="9" />
      <Line x1="8" y1="2.5" x2="8" y2="6" />
      <Line x1="16" y1="2.5" x2="16" y2="6" />
      <Path d="M8 13.5h3M8 17h8" />
    </G>
  ),
  ledger: (
    <G>
      <Path d="M5 3.5h11a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3V3.5z" />
      <Path d="M5 17.5h14" />
      <Path d="M9 7.5h6M9 11h6" />
    </G>
  ),
  camera: (
    <G>
      <Path d="M4 8h2.5l1.2-2h8.6L17.5 8H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z" />
      <Circle cx="12" cy="13" r="3.4" />
    </G>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  shield: (
    <G>
      <Path d="M12 2.8 5 5.4v5.2c0 4.4 2.9 8.4 7 10.2 4.1-1.8 7-5.8 7-10.2V5.4l-7-2.6z" />
      <Path d="m9 11.6 2.2 2.2L15.4 9.5" />
    </G>
  ),
  chain: (
    <G>
      <Rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <Rect x="13.5" y="13" width="7" height="7" rx="1.5" />
      <Path d="M10 8h7v5" />
      <Path d="M14 16H7v-5" />
    </G>
  ),
  clock: (
    <G>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.5V12l3 2" />
    </G>
  ),
  package: (
    <G>
      <Path d="m12 2.8 8 4v10.4l-8 4-8-4V6.8l8-4z" />
      <Path d="m4 6.8 8 4m0 0v10.4m0-10.4 8-4" />
    </G>
  ),
  flask: (
    <G>
      <Path d="M9.5 3h5M10.5 3v5.6L5.6 18a2 2 0 0 0 1.7 3h9.4a2 2 0 0 0 1.7-3l-4.9-9.4V3" />
      <Path d="M7.8 14.5h8.4" />
    </G>
  ),
  search: (
    <G>
      <Circle cx="10.5" cy="10.5" r="6.5" />
      <Line x1="15.4" y1="15.4" x2="20" y2="20" />
    </G>
  ),
  settings: (
    <G>
      <Circle cx="12" cy="12" r="3.2" />
      <Path d="M12 2.8v2.6M12 18.6v2.6M4.7 4.7l1.8 1.8M17.5 17.5l1.8 1.8M2.8 12h2.6M18.6 12h2.6M4.7 19.3l1.8-1.8M17.5 6.5l1.8-1.8" />
    </G>
  ),
  chevronRight: <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <Path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  chevronUp: <Path d="m5.5 14.5 6.5-6.5 6.5 6.5" />,
  chevronLeft: <Path d="M14.5 5.5 8 12l6.5 6.5" />,
  check: <Path d="m4.5 12.5 5 5L19.5 7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <G>
      <Path d="M12 3.5 21.5 20H2.5L12 3.5z" />
      <Line x1="12" y1="10" x2="12" y2="14.2" />
      <Line x1="12" y1="16.8" x2="12" y2="16.9" strokeLinecap="round" />
    </G>
  ),
  lock: (
    <G>
      <Rect x="5" y="10" width="14" height="10" rx="2" />
      <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </G>
  ),
  wifi: (
    <G>
      <Path d="M2.5 8.8A15 15 0 0 1 21.5 8.8M5.6 12.4a11 11 0 0 1 12.8 0M8.8 16a6 6 0 0 1 6.4 0" />
      <Circle cx="12" cy="19.6" r="0.8" />
    </G>
  ),
  wifiOff: (
    <G>
      <Path d="M2.5 8.8A15 15 0 0 1 8 5.6M16 5.6a15 15 0 0 1 5.5 3.2M5.6 12.4a11 11 0 0 1 3.2-2M15.2 10.4a11 11 0 0 1 3.2 2M8.8 16a6 6 0 0 1 6.4 0" />
      <Circle cx="12" cy="19.6" r="0.8" />
      <Line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
    </G>
  ),
  refresh: (
    <G>
      <Path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <Path d="M20 3.5V8h-4.5" />
    </G>
  ),
  download: (
    <G>
      <Path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" />
      <Path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </G>
  ),
  pin: (
    <G>
      <Path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" />
      <Circle cx="12" cy="10" r="2.4" />
    </G>
  ),
  waveform: <Path d="M3 12h2.5L8 6l3 12 3-9 2 3h5" />,
  globe: (
    <G>
      <Circle cx="12" cy="12" r="8.6" />
      <Path d="M3.6 12h16.8M12 3.4c2.6 2.4 4 5.4 4 8.6s-1.4 6.2-4 8.6c-2.6-2.4-4-5.4-4-8.6s1.4-6.2 4-8.6z" />
    </G>
  ),
  info: (
    <G>
      <Circle cx="12" cy="12" r="8.6" />
      <Line x1="12" y1="11" x2="12" y2="16.4" />
      <Circle cx="12" cy="7.8" r="0.7" />
    </G>
  ),
  document: (
    <G>
      <Path d="M6 2.5h8l4.5 4.5v14.5H6V2.5z" />
      <Path d="M14 2.5V7h4.5M9 12h6M9 15.5h6" />
    </G>
  ),
  link: (
    <G>
      <Path d="M10 14a4.2 4.2 0 0 0 6 0l2.4-2.4a4.2 4.2 0 0 0-6-6L11 7" />
      <Path d="M14 10a4.2 4.2 0 0 0-6 0L5.6 12.4a4.2 4.2 0 0 0 6 6L13 17" />
    </G>
  ),
  key: (
    <G>
      <Circle cx="8" cy="8" r="4.4" />
      <Path d="m11.2 11.2 8 8M16 16l2-2M18.6 18.6l1.8-1.8" />
    </G>
  ),
  minus: <Path d="M5 12h14" />,
  sun: (
    <G>
      <Circle cx="12" cy="12" r="3.5" />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </G>
  ),
  moon: <Path d="M19.5 14.2A7.7 7.7 0 0 1 9.8 4.5 8.3 8.3 0 1 0 19.5 14.2Z" />,
  home: (
    <G>
      <Path d="M3 10.5 12 3l9 7.5v9.5a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20v-9.5z" />
    </G>
  ),
  cases: (
    <G>
      <Rect x="3" y="4" width="18" height="4" rx="1.5" />
      <Path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <Line x1="10" y1="12" x2="14" y2="12" />
    </G>
  ),
  scan: (
    <G>
      <Path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <Circle cx="12" cy="12" r="3" />
    </G>
  ),
  user: (
    <G>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5" />
    </G>
  ),
  fingerprint: (
    <G>
      <Path d="M12 2a10 10 0 0 0-8 16M12 5a7 7 0 0 0-5 11M12 8a4 4 0 0 0-3 6.5M12 11a1 1 0 0 0-1 1v4M15 11a2 2 0 0 1 1 2c0 3-1 6-3 8M18 9a6 6 0 0 1 1 3c0 3-1.5 6-3.5 8M21 12c0 3.5-1.5 7-4 9" />
    </G>
  ),
  scale: (
    <G>
      <Line x1="12" y1="3" x2="12" y2="21" />
      <Path d="M5 7l7-3 7 3" />
      <Path d="M5 7v4a3 3 0 0 0 6 0V7" />
      <Path d="M13 7v4a3 3 0 0 0 6 0V7" />
      <Line x1="8" y1="21" x2="16" y2="21" />
    </G>
  ),
  microscope: (
    <G>
      <Path d="M6 18h12M10 21v-3M14 21v-3" />
      <Path d="M9 3l6 6M10 2l5 5-2 2-5-5 2-2z" />
      <Path d="M5 14a5 5 0 0 0 7 4.5" />
      <Line x1="12" y1="10" x2="12" y2="14" />
    </G>
  ),
  checkBadge: (
    <G>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m8.5 12.5 2.5 2.5 5-5" />
    </G>
  ),
  palette: (
    <G>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="7.5" cy="10" r="1.2" />
      <Circle cx="12" cy="6.5" r="1.2" />
      <Circle cx="16.5" cy="10" r="1.2" />
      <Circle cx="14" cy="15" r="1.2" />
    </G>
  ),
  crosshairs: (
    <G>
      <Circle cx="12" cy="12" r="7" />
      <Line x1="12" y1="2" x2="12" y2="5" />
      <Line x1="12" y1="19" x2="12" y2="22" />
      <Line x1="2" y1="12" x2="5" y2="12" />
      <Line x1="19" y1="12" x2="22" y2="12" />
    </G>
  ),
  cpu: (
    <G>
      <Rect x="4" y="4" width="16" height="16" rx="2" />
      <Rect x="9" y="9" width="6" height="6" rx="1" />
      <Line x1="9" y1="1" x2="9" y2="4" />
      <Line x1="15" y1="1" x2="15" y2="4" />
      <Line x1="9" y1="20" x2="9" y2="23" />
      <Line x1="15" y1="20" x2="15" y2="23" />
      <Line x1="20" y1="9" x2="23" y2="9" />
      <Line x1="20" y1="15" x2="23" y2="15" />
      <Line x1="1" y1="9" x2="4" y2="9" />
      <Line x1="1" y1="15" x2="4" y2="15" />
    </G>
  ),
  edit: (
    <G>
      <Path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </G>
  ),
  shieldCheck: (
    <G>
      <Path d="M12 2.8 5 5.4v5.2c0 4.4 2.9 8.4 7 10.2 4.1-1.8 7-5.8 7-10.2V5.4l-7-2.6z" />
      <Path d="m9 11.6 2.2 2.2L15.4 9.5" />
    </G>
  ),
};

export const Icon: React.FC<IconProps> = ({ name, size = 22, color, strokeWidth = 1.8 }) => {
  const { theme } = useAppTheme();
  const stroke = color ?? theme.colors.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shapes[name]}
      </G>
    </Svg>
  );
};
