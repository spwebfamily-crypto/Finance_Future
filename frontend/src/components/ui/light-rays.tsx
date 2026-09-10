"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { cn } from "../../lib/utils";

type AnimationConfig = {
  animate: boolean;
  speed: number;
};

type RaysColorConfig =
  | { mode: "single"; color: string }
  | { mode: "multi"; color1: string; color2: string }
  | { mode: "random" };

export interface LightRaysProps {
  intensity?: number;
  rays?: number;
  reach?: number;
  position?: number;
  radius?: string;
  backgroundColor?: string;
  animation?: AnimationConfig;
  raysColor?: RaysColorConfig;
  style?: CSSProperties;
  className?: string;
}

const VERTEX_SHADER = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform vec2 u_resolution;
uniform float u_time;
uniform vec4 u_colors[2];
uniform float u_intensity;
uniform float u_rays;
uniform float u_reach;
uniform vec2 u_rayPos1;
uniform vec2 u_rayPos2;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  float diagonal = length(u_resolution);

  return clamp(
    (.45 + .15 * sin(cosAngle * seedA + u_time * speed)) +
    (.3 + .2 * cos(-cosAngle * seedB + u_time * speed)),
    u_reach,
    1.0
  ) * clamp((diagonal - length(sourceToCoord)) / diagonal, u_reach, 1.0);
}

void main() {
  vec2 coord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float speed = u_rays * 10.0;

  vec2 rayRefDir1 = normalize(vec2(1.0, -.116));
  vec2 rayRefDir2 = normalize(vec2(1.0, .241));
  float strength1 = rayStrength(u_rayPos1, rayRefDir1, coord, 36.2214 * speed, 21.11349 * speed, 1.5 * speed);
  float strength2 = rayStrength(u_rayPos2, rayRefDir2, coord, 22.39910 * speed, 18.11349 * speed, 1.1 * speed);

  float brightness = u_reach - (coord.y / u_resolution.y);
  float attenuation = clamp(brightness + (.5 + u_intensity), 0.0, 1.0);
  float alpha1 = strength1 * attenuation * u_colors[0].a;
  float alpha2 = strength2 * attenuation * u_colors[1].a;
  vec3 blendedColor = u_colors[0].rgb * alpha1 + u_colors[1].rgb * alpha2;
  float blendedAlpha = alpha1 + alpha2 * (1.0 - alpha1);
  vec3 finalRGB = blendedColor / max(blendedAlpha, .0001);

  gl_FragColor = vec4(finalRGB * blendedAlpha, blendedAlpha);
}
`;

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number) {
  const percentage = (value - fromLow) / (fromHigh - fromLow);
  return toLow + percentage * (toHigh - toLow);
}

function colorToRgb(color: string): [number, number, number] {
  const value = color.trim();

  if (value.startsWith("rgba(") || value.startsWith("rgb(")) {
    const parts = value.slice(value.indexOf("(") + 1, -1).split(",");
    return [Number.parseFloat(parts[0]) / 255, Number.parseFloat(parts[1]) / 255, Number.parseFloat(parts[2]) / 255];
  }

  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0] + hex[0], 16) / 255,
      Number.parseInt(hex[1] + hex[1], 16) / 255,
      Number.parseInt(hex[2] + hex[2], 16) / 255,
    ];
  }

  if (hex.length >= 6) {
    return [
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }

  return [1, 1, 1];
}

function randomGreenPair(): [string, string] {
  const hue = 126 + Math.random() * 38;
  return [`hsl(${hue} 82% 66%)`, `hsl(${hue + 14} 78% 48%)`];
}

/**
 * Spell UI light rays adapted for Vite. The WebGL layer is decorative and has
 * a CSS fallback, so the hero remains green and readable without WebGL.
 */
export default function Rays({
  intensity = 13,
  rays = 32,
  reach = 16,
  position = 50,
  radius = "0px",
  backgroundColor = "transparent",
  animation = { animate: true, speed: 10 },
  raysColor = { mode: "single", color: "#639AFF" },
  style,
  className,
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colorSignature = raysColor.mode === "single"
    ? `single:${raysColor.color}`
    : raysColor.mode === "multi"
      ? `multi:${raysColor.color1}:${raysColor.color2}`
      : "random";
  const colors = useMemo<[string, string]>(() => {
    if (raysColor.mode === "single") return [raysColor.color, raysColor.color];
    if (raysColor.mode === "multi") return [raysColor.color1, raysColor.color2];
    return randomGreenPair();
    // colorSignature intentionally keeps an inline config from recreating the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSignature]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined" || typeof WebGLRenderingContext === "undefined") return;

    let renderer: THREE.WebGLRenderer | undefined;
    let material: THREE.ShaderMaterial | undefined;
    let frameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let resize: (() => void) | undefined;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const [color1, color2] = colors.map(colorToRgb);
    let time = Math.random() * 10_000;
    let lastFrame: number | undefined;

    const render = () => {
      if (!renderer || !material) return;
      renderer.render(scene, camera);
    };

    const run = (timestamp: number) => {
      if (!material) return;
      if (lastFrame !== undefined) {
        time += ((timestamp - lastFrame) * Math.max(0, animation.speed)) / 10_000;
      }
      lastFrame = timestamp;
      material.uniforms.u_time.value = time;
      render();
      if (animation.animate && !reducedMotion?.matches && document.visibilityState === "visible") {
        frameId = window.requestAnimationFrame(run);
      }
    };

    const resume = () => {
      if (!animation.animate || reducedMotion?.matches || document.visibilityState !== "visible" || frameId !== undefined) return;
      lastFrame = undefined;
      frameId = window.requestAnimationFrame(run);
    };

    const pause = () => {
      if (frameId === undefined) return;
      window.cancelAnimationFrame(frameId);
      frameId = undefined;
    };

    const handleVisibilityChange = () => (document.visibilityState === "visible" ? resume() : pause());
    const handleMotionChange = () => (reducedMotion?.matches ? pause() : resume());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;
    const geometry = new THREE.PlaneGeometry(1024, 1024);

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      container.appendChild(renderer.domElement);

      material = new THREE.ShaderMaterial({
        fragmentShader: FRAGMENT_SHADER,
        vertexShader: VERTEX_SHADER,
        uniforms: {
          u_colors: { value: [new THREE.Vector4(...color1, 1), new THREE.Vector4(...color2, 1)] },
          u_intensity: { value: mapRange(intensity, 0, 100, 0, 0.5) },
          u_rays: { value: mapRange(rays, 0, 100, 0, 0.3) },
          u_reach: { value: mapRange(reach, 0, 100, 0, 0.5) },
          u_time: { value: time },
          u_resolution: { value: [1, 1] },
          u_rayPos1: { value: [0, 0] },
          u_rayPos2: { value: [0, 0] },
        },
        side: THREE.DoubleSide,
        transparent: true,
      });

      scene.add(new THREE.Mesh(geometry, material));

      resize = () => {
        if (!renderer || !material) return;
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        material.uniforms.u_resolution.value = [width, height];
        material.uniforms.u_rayPos1.value = [(position / 100) * width, -0.4 * height];
        material.uniforms.u_rayPos2.value = [((position / 100) + 0.02) * width, -0.5 * height];
        render();
      };

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
      } else {
        window.addEventListener("resize", resize);
      }
      document.addEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion?.addEventListener("change", handleMotionChange);
      resize();
      resume();
    } catch {
      // The CSS fallback remains in place when WebGL is unavailable or blocked.
      renderer?.dispose();
    }

    return () => {
      pause();
      resizeObserver?.disconnect();
      if (resize) window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion?.removeEventListener("change", handleMotionChange);
      geometry.dispose();
      material?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [animation.animate, animation.speed, colors, intensity, position, rays, reach]);

  const variables = {
    "--light-rays-color-1": colors[0],
    "--light-rays-color-2": colors[1],
    "--light-rays-color-1-rgb": colorToRgb(colors[0]).map((channel) => Math.round(channel * 255)).join(" "),
    "--light-rays-color-2-rgb": colorToRgb(colors[1]).map((channel) => Math.round(channel * 255)).join(" "),
    "--light-rays-position": `${position}%`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("light-rays", className)}
      style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, backgroundColor, pointerEvents: "none", ...variables, ...style }}
    >
      <span className="light-rays__fallback" />
      <span className="light-rays__beam light-rays__beam--one" />
      <span className="light-rays__beam light-rays__beam--two" />
      <span className="light-rays__beam light-rays__beam--three" />
      <span className="light-rays__beam light-rays__beam--four" />
      <span className="light-rays__beam light-rays__beam--five" />
    </div>
  );
}
