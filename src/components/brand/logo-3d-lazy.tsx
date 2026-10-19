"use client";

import dynamic from "next/dynamic";
import { LogoMark } from "./logo";

/** Client-only 3D logo with the 2D mark as placeholder while three.js loads. */
export const Logo3DLazy = dynamic(() => import("./logo-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <LogoMark className="h-20 w-20" />
    </div>
  ),
});
