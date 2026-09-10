import type { CSSProperties, ReactNode } from "react";

type IPhoneModel = "14" | "14-pro" | "15" | "15-pro" | "x" | "plain";
type Orientation = "portrait" | "landscape";
type WallpaperFit = "cover" | "contain" | "fill";

export interface IPhoneMockupProps {
  model?: IPhoneModel;
  color?:
    | "black"
    | "midnight"
    | "silver"
    | "starlight"
    | "space-black"
    | "gold"
    | "blue"
    | "pink"
    | "titanium"
    | "natural-titanium"
    | "green"
    | "red"
    | string;
  orientation?: Orientation;
  scale?: number;
  bezel?: number;
  radius?: number;
  shadow?: boolean | string;
  screenBg?: string;
  wallpaper?: string;
  wallpaperFit?: WallpaperFit;
  wallpaperPosition?: string;
  showDynamicIsland?: boolean;
  showNotch?: boolean;
  islandWidth?: number;
  islandHeight?: number;
  islandRadius?: number;
  notchWidth?: number;
  notchHeight?: number;
  notchRadius?: number;
  safeArea?: boolean;
  safeAreaOverrides?: Partial<{ top: number; bottom: number; left: number; right: number }>;
  showHomeIndicator?: boolean;
  innerShadow?: boolean;
  style?: CSSProperties;
  className?: string;
  frameStyle?: CSSProperties;
  screenStyle?: CSSProperties;
  ariaLabel?: string;
  children?: ReactNode;
}

const DEVICE_SPECS: Record<
  IPhoneModel,
  {
    w: number;
    h: number;
    radius: number;
    bezel: number;
    topSafe: number;
    bottomSafe: number;
    notch?: { w: number; h: number; r: number };
    island?: { w: number; h: number; r: number };
  }
> = {
  x: {
    w: 375,
    h: 812,
    radius: 50,
    bezel: 12,
    topSafe: 47,
    bottomSafe: 34,
    notch: { w: 210, h: 35, r: 18 },
  },
  "14": {
    w: 390,
    h: 844,
    radius: 56,
    bezel: 12,
    topSafe: 47,
    bottomSafe: 34,
    notch: { w: 225, h: 33, r: 18 },
  },
  "14-pro": {
    w: 393,
    h: 852,
    radius: 56,
    bezel: 12,
    topSafe: 59,
    bottomSafe: 34,
    island: { w: 126, h: 37, r: 20 },
  },
  "15": {
    w: 393,
    h: 852,
    radius: 56,
    bezel: 12,
    topSafe: 59,
    bottomSafe: 34,
    island: { w: 126, h: 37, r: 20 },
  },
  "15-pro": {
    w: 393,
    h: 852,
    radius: 56,
    bezel: 12,
    topSafe: 59,
    bottomSafe: 34,
    island: { w: 126, h: 37, r: 20 },
  },
  plain: {
    w: 390,
    h: 844,
    radius: 56,
    bezel: 12,
    topSafe: 16,
    bottomSafe: 16,
  },
};

const PRESET_COLORS: Record<string, string> = {
  black: "#0b0b0d",
  midnight: "#0b0c10",
  silver: "#d7d8dc",
  starlight: "#f1eee9",
  "space-black": "#1c1e22",
  gold: "#f2dfb3",
  blue: "#2b4fa8",
  pink: "#ffbfd1",
  titanium: "#837a72",
  "natural-titanium": "#a69a8a",
  green: "#2b622e",
  red: "#c81f2f",
};

function shade(hex: string, percentage: number) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return hex;
  const multiplier = (100 + percentage) / 100;
  const toChannel = (value: string) =>
    Math.max(0, Math.min(255, Math.round(Number.parseInt(value, 16) * multiplier)))
      .toString(16)
      .padStart(2, "0");
  return `#${toChannel(match[1])}${toChannel(match[2])}${toChannel(match[3])}`;
}

export function IPhoneMockup({
  model = "14-pro",
  color = "space-black",
  orientation = "portrait",
  scale = 1,
  bezel,
  radius,
  shadow = true,
  screenBg = "#000",
  wallpaper,
  wallpaperFit = "cover",
  wallpaperPosition = "center",
  showDynamicIsland,
  showNotch,
  islandWidth,
  islandHeight,
  islandRadius,
  notchWidth,
  notchHeight,
  notchRadius,
  safeArea = true,
  safeAreaOverrides,
  showHomeIndicator = true,
  innerShadow = true,
  style,
  className,
  frameStyle,
  screenStyle,
  ariaLabel,
  children,
}: IPhoneMockupProps) {
  const spec = DEVICE_SPECS[model];
  const useIsland = showDynamicIsland ?? Boolean(spec.island);
  const useNotch = showNotch ?? (Boolean(spec.notch) && !useIsland);
  const resolvedRadius = radius ?? spec.radius;
  const resolvedBezel = bezel ?? spec.bezel;
  const isLandscape = orientation === "landscape";
  const screenWidth = isLandscape ? spec.h : spec.w;
  const screenHeight = isLandscape ? spec.w : spec.h;
  const outerWidth = screenWidth + resolvedBezel * 2;
  const outerHeight = screenHeight + resolvedBezel * 2;
  const colorHex = PRESET_COLORS[color] ?? color;
  const outerShadow =
    typeof shadow === "string"
      ? shadow
      : shadow
        ? "0 12px 30px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18)"
        : "none";
  const insets = {
    top: safeAreaOverrides?.top ?? spec.topSafe,
    bottom: safeAreaOverrides?.bottom ?? spec.bottomSafe,
    left: safeAreaOverrides?.left ?? 0,
    right: safeAreaOverrides?.right ?? 0,
  };
  const cutoutStyle: CSSProperties = {
    position: "absolute",
    zIndex: 3,
    top: useIsland ? 12 : 8,
    left: "50%",
    width: useIsland ? (islandWidth ?? spec.island?.w ?? 0) : (notchWidth ?? spec.notch?.w ?? 0),
    height: useIsland
      ? (islandHeight ?? spec.island?.h ?? 0)
      : (notchHeight ?? spec.notch?.h ?? 0),
    background: "#000",
    borderRadius: useIsland
      ? (islandRadius ?? spec.island?.r ?? 0)
      : (notchRadius ?? spec.notch?.r ?? 0),
    boxShadow: "0 1px 2px rgba(0,0,0,0.7)",
    transform: "translateX(-50%)",
  };

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: outerWidth * scale,
        height: outerHeight * scale,
        ...style,
      }}
    >
      <div
        aria-label={ariaLabel ?? `iPhone mockup (${model})`}
        style={{
          position: "relative",
          width: outerWidth,
          height: outerHeight,
          padding: resolvedBezel,
          overflow: "hidden",
          boxSizing: "border-box",
          background: `linear-gradient(135deg, ${shade(colorHex, 8)} 0%, ${colorHex} 40%, ${shade(colorHex, -14)} 100%)`,
          borderRadius: resolvedRadius + resolvedBezel,
          boxShadow: outerShadow,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          ...frameStyle,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: screenBg,
            borderRadius: resolvedRadius,
            boxShadow: innerShadow
              ? "inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 10px 20px rgba(0,0,0,0.18)"
              : "none",
            ...screenStyle,
          }}
        >
          {wallpaper && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                zIndex: 0,
                inset: 0,
                backgroundImage: `url(${wallpaper})`,
                backgroundPosition: wallpaperPosition,
                backgroundRepeat: "no-repeat",
                backgroundSize: wallpaperFit,
              }}
            />
          )}
          {(useIsland || useNotch) && <div aria-hidden="true" style={cutoutStyle} />}
          <div
            style={
              safeArea
                ? {
                    position: "absolute",
                    zIndex: 1,
                    top: insets.top,
                    right: insets.right,
                    bottom: insets.bottom,
                    left: insets.left,
                    display: "flex",
                    overflow: "hidden",
                    flexDirection: "column",
                  }
                : {
                    position: "absolute",
                    zIndex: 1,
                    inset: 0,
                    display: "flex",
                    overflow: "hidden",
                    flexDirection: "column",
                  }
            }
          >
            {children}
          </div>
          {showHomeIndicator && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                zIndex: 3,
                bottom: 8,
                left: "50%",
                width: Math.min(140, Math.round(screenWidth * 0.34)),
                height: 5,
                background: "rgba(29,29,31,0.72)",
                borderRadius: 3,
                transform: "translateX(-50%)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default IPhoneMockup;
