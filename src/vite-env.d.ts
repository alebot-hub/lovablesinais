/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';
  
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }
  
  export const TrendingUp: FC<IconProps>;
  export const TrendingDown: FC<IconProps>;
  export const Activity: FC<IconProps>;
  export const Target: FC<IconProps>;
  export const DollarSign: FC<IconProps>;
  export const Clock: FC<IconProps>;
  export const Volume2: FC<IconProps>;
  export const AlertCircle: FC<IconProps>;
  export const CheckCircle: FC<IconProps>;
  export const Bot: FC<IconProps>;
  export const Zap: FC<IconProps>;
  export const Shield: FC<IconProps>;
  export const Building2: FC<IconProps>;
  export const BarChart3: FC<IconProps>;
  export const AlertTriangle: FC<IconProps>;
  export const Cpu: FC<IconProps>;
  export const Database: FC<IconProps>;
  export const Wifi: FC<IconProps>;
  export const Play: FC<IconProps>;
  export const Award: FC<IconProps>;
  export const Calendar: FC<IconProps>;
  export const PieChart: FC<IconProps>;
}