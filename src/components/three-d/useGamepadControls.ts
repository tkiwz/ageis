"use client";

import { useEffect, useRef, useState } from "react";

export interface GamepadState {
  connected: boolean;
  controllerName: string;
  // Sticks (-1 to 1)
  leftStickX: number;
  leftStickY: number;
  rightStickX: number;
  rightStickY: number;
  // Triggers (0 to 1)
  l2: number;
  r2: number;
  // Buttons (pressed this frame = rising edge only)
  cross: boolean;      // ✕  button 0
  circle: boolean;     // ○  button 1
  square: boolean;     // □  button 2
  triangle: boolean;   // △  button 3
  // D-Pad (pressed this frame)
  dpadUp: boolean;     // button 12
  dpadDown: boolean;   // button 13
  dpadLeft: boolean;   // button 14
  dpadRight: boolean;  // button 15
  // Shoulders
  l1: boolean;         // button 4
  r1: boolean;         // button 5
  // PS5 Touchpad click (button 17)
  touchpad: boolean;
}

const DEADZONE = 0.15;

function applyDeadzone(value: number): number {
  if (Math.abs(value) < DEADZONE) return 0;
  // Normalize after deadzone
  return (value - Math.sign(value) * DEADZONE) / (1 - DEADZONE);
}

/**
 * Hook to read PS5/Xbox controller state.
 * Uses requestAnimationFrame for 60fps polling.
 */
export function useGamepadControls(): GamepadState {
  const [state, setState] = useState<GamepadState>({
    connected: false,
    controllerName: "",
    leftStickX: 0,
    leftStickY: 0,
    rightStickX: 0,
    rightStickY: 0,
    l2: 0,
    r2: 0,
    cross: false,
    circle: false,
    square: false,
    triangle: false,
    dpadUp: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    l1: false,
    r1: false,
    touchpad: false,
  });

  const previousButtons = useRef<boolean[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      console.log("🎮 Gamepad connected:", e.gamepad.id);
    };

    const handleDisconnect = (e: GamepadEvent) => {
      console.log("🎮 Gamepad disconnected:", e.gamepad.id);
      setState((prev) => ({ ...prev, connected: false, controllerName: "" }));
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gp = Array.from(gamepads).find((g) => g !== null);

      if (gp) {
        // Detect button "pressed this frame" (rising edge)
        const buttonsNow = gp.buttons.map((b) => b.pressed);
        const wasPressed = (idx: number) =>
          buttonsNow[idx] && !previousButtons.current[idx];

        // PS5 button mapping (standard gamepad layout)
        // 0: Cross (X), 1: Circle (O), 2: Square, 3: Triangle
        // 4: L1, 5: R1
        // 6: L2 (analog via buttons), 7: R2
        // 12: D-Up, 13: D-Down, 14: D-Left, 15: D-Right

        const newState: GamepadState = {
          connected: true,
          controllerName: gp.id,
          leftStickX: applyDeadzone(gp.axes[0] || 0),
          leftStickY: applyDeadzone(gp.axes[1] || 0),
          rightStickX: applyDeadzone(gp.axes[2] || 0),
          rightStickY: applyDeadzone(gp.axes[3] || 0),
          l2: gp.buttons[6]?.value || 0,
          r2: gp.buttons[7]?.value || 0,
          cross:    wasPressed(0),
          circle:   wasPressed(1),
          square:   wasPressed(2),
          triangle: wasPressed(3),
          l1:       wasPressed(4),
          r1:       wasPressed(5),
          dpadUp:    wasPressed(12),
          dpadDown:  wasPressed(13),
          dpadLeft:  wasPressed(14),
          dpadRight: wasPressed(15),
          // PS5 touchpad click — button index 17
          touchpad: wasPressed(17),
        };

        setState(newState);
        previousButtons.current = buttonsNow;
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return state;
}